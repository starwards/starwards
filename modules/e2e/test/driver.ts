import * as path from 'path';

import { GameManager, server } from '@starwards/server';
import { Locator, expect, test } from '@playwright/test';

import { limitPercision } from '@starwards/core';

export function makeDriver(t: typeof test) {
    let gameManager: GameManager | null = null;
    let serverInfo: Awaited<ReturnType<typeof server>> | null = null;
    t.beforeAll(async () => {
        gameManager = new GameManager();
        serverInfo = await server(8080, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
    });
    t.afterAll(async () => {
        await serverInfo?.close();
    });

    t.afterEach(async () => {
        await gameManager?.stopGame();
    });
    return {
        get gameManager() {
            if (!gameManager) throw new Error('missing gameManager');
            return gameManager;
        },
        getShip(id: string) {
            const ship = this.gameManager.scriptApi.getShip(id);
            if (!ship) {
                throw new Error(`ship ${id} not found`);
            }
            return ship;
        },
    };
}

export class RadarDriver {
    constructor(public canvas: Locator) {}

    async getZoom() {
        return limitPercision(Number(await this.canvas.getAttribute('data-zoom')));
    }
    async setZoom(target: number) {
        const page = this.canvas.page();
        await this.canvas.hover();
        const f = 1000 * (target / (await this.getZoom()) - 1); // tightly coupled logic from Camera and radarWidget logic
        await page.mouse.wheel(0, -f);
        expect(await this.getZoom()).toEqual(target);
    }
}
