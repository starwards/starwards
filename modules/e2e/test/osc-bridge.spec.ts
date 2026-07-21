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
 * not admitted by @tweakable/@commandable/DesignState — no game state change occurs.
 */

import * as dgram from 'dgram';
import { Page, expect, test } from '@playwright/test';
import { PowerLevel } from '@starwards/core';
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

        // Poll the ship-read → rate-limit → OSC encode → udp out → O-S-C cycle.
        // Energy drifts naturally (~12/s) after being set, so assert proximity.
        await expect
            .poll(async () => Math.abs(((await getWidgetValue(page, 'reactor_energy')) as number) - targetEnergy), {
                timeout: 15_000,
            })
            .toBeLessThan(50);
    });
});

test.describe('initial values — session load populates all widgets', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('all faders show current ship state on load, without any state change', async ({ page }) => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        // Distinctive values set BEFORE the page loads — the only way the
        // widgets can show them is the subscribe bootstrap's immediate emit.
        // The burst of one emit per address must survive the rate limiter
        // (per-topic queue mode; a global limiter drops all but one).
        spaceShip.state.reactor.power = PowerLevel.HIGH;
        spaceShip.state.reactor.coolantFactor = 0.65;

        // Loading the session triggers the custom module's subscribe burst
        await page.goto(`${OSC_BRIDGE_URL}/?id=reactor-demo`);
        await page.waitForLoadState('networkidle');

        // Bootstrap fires ~1 s after session open; poll past reconnect jitter
        await expect
            .poll(async () => getWidgetValue(page, 'reactor_power'), { timeout: 15_000 })
            .toBeCloseTo(PowerLevel.HIGH, 1);
        await expect
            .poll(async () => getWidgetValue(page, 'reactor_coolant'), { timeout: 15_000 })
            .toBeCloseTo(0.65, 1);
        // energy drifts, so just assert a live (non-zero) value arrived
        await expect.poll(async () => getWidgetValue(page, 'reactor_energy'), { timeout: 15_000 }).toBeGreaterThan(0);
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
        // tablets on the same id would collide (only one receives feedback).
        // The bridge module strips a ~suffix, so both share reactor-demo.json.
        await page2.goto(`${OSC_BRIDGE_URL}/?id=reactor-demo~2`);
        await page1.waitForLoadState('networkidle');
        await page2.waitForLoadState('networkidle');

        // Subscribe both clients to the same pointer
        const subMsg = encodeOscString('/starwards/subscribe', '/reactor/energy');
        await sendUdp(NODE_RED_HOST, NODE_RED_SUB_PORT, subMsg);
        await sendUdp(NODE_RED_HOST, NODE_RED_SUB_PORT, subMsg);

        spaceShip.state.reactor.energy = 750;

        // energy drifts naturally after being set — poll for proximity on both clients
        for (const p of [page1, page2]) {
            await expect
                .poll(async () => Math.abs(((await getWidgetValue(p, 'reactor_energy')) as number) - 750), {
                    timeout: 15_000,
                })
                .toBeLessThan(50);
        }

        await ctx1.close();
        await ctx2.close();
    });
});

test.describe('noise budget — high-frequency updates do not flood O-S-C', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('rate-limit node caps feedback messages at 25/s per address', async ({ page }) => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');

        // Load the demo session — its custom-module bootstrap subscribes
        // /reactor/energy, so feedback for it reaches this client's widget.
        await page.goto(`${OSC_BRIDGE_URL}/?id=reactor-demo`);
        await page.waitForLoadState('networkidle');
        // Wait for feedback to actually flow (bootstrap + reconnect jitter)
        await expect.poll(async () => getWidgetValue(page, 'reactor_energy'), { timeout: 15_000 }).toBeGreaterThan(0);

        // Count inbound display updates on the widget: every feedback message
        // that survives the rate limiter lands as a setValue call.
        await page.evaluate(() => {
            const win = window as unknown as { __energyUpdates: number };
            win.__energyUpdates = 0;
            for (const el of document.querySelectorAll('[data-widget]')) {
                const w = (
                    el as unknown as {
                        _widget_instance?: { getProp: (k: string) => unknown; setValue: (...a: unknown[]) => void };
                    }
                )._widget_instance;
                if (w && w.getProp('id') === 'reactor_energy') {
                    const orig = w.setValue.bind(w);
                    w.setValue = (...args: unknown[]) => {
                        win.__energyUpdates++;
                        orig(...args);
                    };
                }
            }
        });

        // Emit 100 changes over 2 s (~50/s, 2× the 25/s limit)
        for (let i = 0; i < 100; i++) {
            spaceShip.state.reactor.energy = 100 + i;
            await new Promise((r) => setTimeout(r, 20));
        }
        // let queued messages drain before reading the counter
        await page.waitForTimeout(300);

        const updates = await page.evaluate(() => (window as unknown as { __energyUpdates: number }).__energyUpdates);
        // ≤25/s over the ~2.3 s window ⇒ at most ~58; allow slack for timer skew.
        // A missing/global-passthrough limiter would deliver ~100+.
        expect(updates).toBeGreaterThan(10); // feedback actually flowed
        expect(updates).toBeLessThanOrEqual(70); // capped at ~25/s
    });
});

test.describe('rejection path — non-admitted write is dropped', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test('OSC write to a non-tweakable path does not change ship state', async () => {
        const spaceShip = gameDriver.gameManager.scriptApi.getShip(shipId);
        if (!spaceShip) throw new Error('ship not found in space');
        const before = spaceShip.state.reactor.effeciencyFactor;

        // /reactor/effeciencyFactor is not admitted: plain @gameField+@defectible,
        // not @tweakable/@commandable, and not under a DesignState (design fields
        // ARE admitted for the GM design panel — see JsonPointer.set whitelist).
        const msg = encodeOscFloat('/reactor/effeciencyFactor', 0.123);
        await sendUdp(NODE_RED_HOST, OSC_UDP_PORT, msg);

        await new Promise((r) => setTimeout(r, 1000));

        // State must be unchanged — ship-write's JSON-pointer admission blocks this write
        expect(spaceShip.state.reactor.effeciencyFactor).toBe(before);
    });
});
