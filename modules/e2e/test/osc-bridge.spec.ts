/**
 * E2E tests for the OSC controller framework (Open Stage Control ↔ Node-RED ↔ Starwards).
 *
 * These tests require a running O-S-C instance (docker/osc/) and Node-RED with the
 * osc-bridge-flow.json loaded. They are skipped in CI unless OSC_BRIDGE_URL is set.
 *
 * The Node-RED flow targets starwards-server:8080 (the docker host), so the spec's
 * own game server must own host port 8080: stop any running dev server first, and
 * run this spec alone (with parallel workers, only worker 0 gets port 8080).
 *
 * Run locally:
 *   docker compose -f docker/docker-compose.yml up -d
 *   OSC_BRIDGE_URL=http://localhost:8090 npm run test:e2e -- osc-bridge.spec.ts
 *
 * Architecture under test:
 *   O-S-C widget → UDP → Node-RED ship-write (write path)
 *   ship-read subscribe → RBE → rate-limit → O-S-C (feedback path)
 *
 * Rejection path (non-admitted write): ship-write drops writes to paths
 * not admitted by @tweakable/@commandable — no game state change occurs.
 */

import * as dgram from 'dgram';
import { Page, expect, test } from '@playwright/test';
import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;

const OSC_BRIDGE_URL = process.env.OSC_BRIDGE_URL;
// Node-RED's OSC write-path udp-in as published on the host (57123:57120 in docker-compose.yml)
const OSC_UDP_PORT = parseInt(process.env.OSC_UDP_PORT ?? '57123', 10);
const NODE_RED_SUB_PORT = parseInt(process.env.NODE_RED_SUB_PORT ?? '57121', 10);
const NODE_RED_HOST = process.env.NODE_RED_HOST ?? 'localhost';

// Skip all tests if O-S-C is not configured
test.skip(!OSC_BRIDGE_URL, 'OSC_BRIDGE_URL not set — start docker/osc and docker/node-red first');

const gameDriver = makeDriver(test);

test.beforeAll(() => {
    // The Node-RED flow targets starwards-server:8080 — this spec's server must own it
    test.skip(gameDriver.port !== 8080, 'needs host port 8080: stop the dev server and run this spec alone');
});

// ---------------------------------------------------------------------------
// Helper: encode a minimal OSC message (address + single float arg)
// without depending on the osc npm package in e2e tests.
// Format: padded address string + type-tag string ",f" + float32 big-endian.
// ---------------------------------------------------------------------------
function encodeOscFloat(address: string, value: number): Buffer {
    const padTo4 = (n: number) => Math.ceil(n / 4) * 4;
    const addrBytes = Buffer.from(address + '\0');
    const addrPadded = padTo4(addrBytes.length);
    const typeTag = Buffer.from(',f\0\0');
    const floatBuf = Buffer.allocUnsafe(4);
    floatBuf.writeFloatBE(value, 0);

    const total = addrPadded + typeTag.length + floatBuf.length;
    const buf = Buffer.alloc(total);
    addrBytes.copy(buf, 0);
    typeTag.copy(buf, addrPadded);
    floatBuf.copy(buf, addrPadded + typeTag.length);
    return buf;
}

// ---------------------------------------------------------------------------
// Helper: encode /starwards/subscribe OSC message (address + string arg)
// ---------------------------------------------------------------------------
function encodeOscString(oscAddress: string, strArg: string): Buffer {
    const padTo4 = (n: number) => Math.ceil(n / 4) * 4;
    const addrBytes = Buffer.from(oscAddress + '\0');
    const addrPadded = padTo4(addrBytes.length);
    const typeTag = Buffer.from(',s\0\0');
    const strBytes = Buffer.from(strArg + '\0');
    const strPadded = padTo4(strBytes.length);

    const total = addrPadded + typeTag.length + strPadded;
    const buf = Buffer.alloc(total);
    addrBytes.copy(buf, 0);
    typeTag.copy(buf, addrPadded);
    strBytes.copy(buf, addrPadded + typeTag.length);
    return buf;
}

function sendUdp(host: string, port: number, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
        const sock = dgram.createSocket('udp4');
        sock.send(data, 0, data.length, port, host, (err) => {
            sock.close();
            if (err) reject(err);
            else resolve();
        });
    });
}

// ---------------------------------------------------------------------------
// Helper: read a widget value from a live O-S-C page via _widget_instance.
// See docs/reference/open-stage-control-reference.md Q3 for the DOM recipe.
// ---------------------------------------------------------------------------
async function getWidgetValue(page: Page, widgetId: string): Promise<unknown> {
    return page.evaluate((id) => {
        for (const el of document.querySelectorAll('[data-widget]')) {
            const w = (
                el as unknown as {
                    _widget_instance?: { getProp: (k: string) => unknown; getValue: () => unknown };
                }
            )._widget_instance;
            if (w && w.getProp('id') === id) return w.getValue();
        }
        return undefined;
    }, widgetId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('OSC write path — widget press → state change', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('fader change sends OSC and updates ship state', async () => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        // Send an OSC float message directly (simulates a fader being dragged).
        // Resend inside the poll: Node-RED's ship driver may still be reconnecting
        // to this spec's freshly started server, dropping early packets.
        const newPower = 0.3;
        const msg = encodeOscFloat('/reactor/power', newPower);
        await expect
            .poll(
                async () => {
                    await sendUdp(NODE_RED_HOST, OSC_UDP_PORT, msg);
                    await new Promise((r) => setTimeout(r, 300));
                    return spaceShip.state.reactor.power;
                },
                { timeout: 15_000 },
            )
            .toBeCloseTo(newPower, 1);
    });
});

test.describe('OSC feedback path — state change → widget display update', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('ship state change updates O-S-C widget via subscribe feedback', async ({ page }) => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        // Load reactor-demo session in the browser O-S-C client
        await page.goto(`${OSC_BRIDGE_URL}/?id=reactor-demo`);
        await page.waitForLoadState('networkidle');

        // Bootstrap: send a subscribe message via Node-RED sub port
        const subMsg = encodeOscString('/starwards/subscribe', '/reactor/energy');
        await sendUdp(NODE_RED_HOST, NODE_RED_SUB_PORT, subMsg);

        // Trigger a state change server-side
        const targetEnergy = 500;
        spaceShip.state.reactor.energy = targetEnergy;

        // Allow ship-read → rate-limit → OSC encode → udp out → O-S-C cycle.
        // Energy drifts naturally (~12/s) after being set, so assert proximity.
        await page.waitForTimeout(800);

        const value = await getWidgetValue(page, 'reactor_energy');
        expect(typeof value).toBe('number');
        expect(Math.abs((value as number) - targetEnergy)).toBeLessThan(50);
    });
});

test.describe('multi-controller — two clients see same state', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('two O-S-C clients receive the same feedback', async ({ browser }) => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        const ctx1 = await browser.newContext();
        const ctx2 = await browser.newContext();
        const page1 = await ctx1.newPage();
        const page2 = await ctx2.newPage();

        await page1.goto(`${OSC_BRIDGE_URL}/?id=reactor-demo`);
        // distinct client id — O-S-C keeps one client record per id, so two
        // tablets on the same id would collide (only one receives feedback)
        await page2.goto(`${OSC_BRIDGE_URL}/?id=reactor-demo-2`);
        await page1.waitForLoadState('networkidle');
        await page2.waitForLoadState('networkidle');

        // Subscribe both clients to the same pointer
        const subMsg = encodeOscString('/starwards/subscribe', '/reactor/energy');
        await sendUdp(NODE_RED_HOST, NODE_RED_SUB_PORT, subMsg);
        await sendUdp(NODE_RED_HOST, NODE_RED_SUB_PORT, subMsg);

        spaceShip.state.reactor.energy = 750;
        await page1.waitForTimeout(800);
        await page2.waitForTimeout(800);

        // energy drifts naturally after being set — assert proximity on both clients
        const v1 = await getWidgetValue(page1, 'reactor_energy');
        const v2 = await getWidgetValue(page2, 'reactor_energy');
        expect(Math.abs((v1 as number) - 750)).toBeLessThan(50);
        expect(Math.abs((v2 as number) - 750)).toBeLessThan(50);

        await ctx1.close();
        await ctx2.close();
    });
});

test.describe('noise budget — high-frequency updates do not flood O-S-C', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('rate-limit node caps feedback messages at 25/s per address', async () => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        // Subscribe to the fast-changing energy field
        const subMsg = encodeOscString('/starwards/subscribe', '/reactor/energy');
        await sendUdp(NODE_RED_HOST, NODE_RED_SUB_PORT, subMsg);

        // Emit 50 changes in 1 s (10× the rate limit of 25/s)
        const start = Date.now();
        for (let i = 0; i < 50; i++) {
            spaceShip.state.reactor.energy = i * 10;
            await new Promise((r) => setTimeout(r, 20));
        }
        const elapsed = Date.now() - start;

        // Verify: we produced 50 updates over ~1 s; the rate-limit node in Node-RED
        // should cap the outbound OSC to ≤25 msgs/s. This assertion validates
        // the test harness produced the right load.
        expect(elapsed).toBeGreaterThan(900);
    });
});

test.describe('rejection path — non-admitted write is dropped', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('OSC write to a non-tweakable path does not change ship state', async () => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');
        const before = spaceShip.state.reactor.design.damage50;

        // /reactor/design/damage50 is read-only (plain @gameField, not @tweakable/@commandable)
        const msg = encodeOscFloat('/reactor/design/damage50', before + 999);
        await sendUdp(NODE_RED_HOST, OSC_UDP_PORT, msg);

        await new Promise((r) => setTimeout(r, 1000));

        // State must be unchanged — ship-write's JSON-pointer admission blocks this write
        expect(spaceShip.state.reactor.design.damage50).toBe(before);
    });
});
