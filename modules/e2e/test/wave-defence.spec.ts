import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { createWaveDefenceMap, waveDefenceStations } from '@starwards/server';
import { expect, test } from '@playwright/test';

import { XY } from '@starwards/core';
import { makeDriver } from './driver';

const gameDriver = makeDriver(test);
const stationLarge = waveDefenceStations.find((s) => s.id === 'station-large')!;

test.describe('Wave-defence scenario', () => {
    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    test('loading the map spawns wave 1, both bots attack station-large, and they close on it', async ({ page }) => {
        setupPageErrorHandlers(page);

        // rng pinned to 0 so wave 1 is deterministically two dragonfly-MK1 (see wave-defence.ts)
        const map = createWaveDefenceMap(() => 0);
        await gameDriver.gameManager.startGame(map);

        await navigateToScreen(page, '/gm.html', { baseURL: gameDriver.baseURL });
        await expect(page.locator('.lm_goldenlayout')).toBeVisible({ timeout: 10000 });

        const wave1Ids = [...gameDriver.gameManager.scriptApi.getObjects()]
            .filter((o) => o.id !== 'GVTS' && !waveDefenceStations.some((s) => s.id === o.id))
            .map((o) => o.id);
        expect(wave1Ids).toHaveLength(2);

        // both bots pick up the ATTACK order on station-large within a few real ticks
        await expect(() => {
            for (const id of wave1Ids) {
                const ship = gameDriver.getShip(id);
                expect(ship.state.orderTargetId).toEqual('station-large');
            }
        }).toPass({ timeout: 10000 });

        const initialDistances = new Map(
            wave1Ids.map((id) => [
                id,
                XY.lengthOf(XY.difference(gameDriver.getShip(id).spaceObject.position, stationLarge.position)),
            ]),
        );

        await expect(() => {
            for (const id of wave1Ids) {
                const distance = XY.lengthOf(
                    XY.difference(gameDriver.getShip(id).spaceObject.position, stationLarge.position),
                );
                expect(distance).toBeLessThan(initialDistances.get(id)!);
            }
        }).toPass({ timeout: 15000 });
    });
});
