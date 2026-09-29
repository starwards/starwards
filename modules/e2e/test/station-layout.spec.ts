import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';

import { makeDriver } from './driver';
import { maps } from '@starwards/server';

const { single_ship } = maps;
const shipId = single_ship.testShipId;
const gameDriver = makeDriver(test);

type Box = { id: string; x: number; y: number; width: number; height: number };

const stations = ['helms', 'weapons', 'engineer', 'signals', 'dradis'];
const viewports = [
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
];

const intersects = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('Station layout', () => {
    test.beforeEach(async () => {
        await gameDriver.gameManager.startGame(single_ship);
    });

    test.afterEach(async ({ page }) => {
        await cleanupPageState(page);
    });

    for (const viewport of viewports) {
        for (const station of stations) {
            test(`${station} panels neither overlap nor leave the ${viewport.width}x${viewport.height} viewport`, async ({
                page,
            }) => {
                setupPageErrorHandlers(page);
                await page.setViewportSize(viewport);
                await navigateToScreen(page, `/${station}.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
                await expect(page.locator('.tp-rotv[data-id]').first()).toBeVisible({ timeout: 10000 });
                // panes fill in asynchronously; let the layout settle
                await page.waitForTimeout(1500);
                const boxes = await page.evaluate((): Box[] => {
                    const topLevel = (el: Element) => !el.parentElement?.closest('.tp-rotv');
                    return [...document.querySelectorAll('[data-id]')]
                        .filter((el) => {
                            const id = el.getAttribute('data-id');
                            const isPane = el.classList.contains('tp-rotv');
                            return (isPane || id === 'Damage Report' || id === 'Armor') && topLevel(el);
                        })
                        .map((el) => {
                            // a pane inside a scrolling slot only occupies the part of itself the slot shows
                            let { left, top, right, bottom } = el.getBoundingClientRect();
                            for (let a = el.parentElement; a && a.id !== 'wrapper'; a = a.parentElement) {
                                const { overflowX, overflowY } = getComputedStyle(a);
                                if (overflowX === 'visible' && overflowY === 'visible') continue;
                                const c = a.getBoundingClientRect();
                                left = Math.max(left, c.left);
                                top = Math.max(top, c.top);
                                right = Math.min(right, c.right);
                                bottom = Math.min(bottom, c.bottom);
                            }
                            return {
                                id: el.getAttribute('data-id') ?? '',
                                x: left,
                                y: top,
                                width: Math.max(0, right - left),
                                height: Math.max(0, bottom - top),
                            };
                        })
                        .filter((b) => b.width > 0 && b.height > 0);
                });
                expect(boxes.length).toBeGreaterThan(1);
                for (const b of boxes) {
                    expect(b.x, `${b.id} left edge`).toBeGreaterThanOrEqual(0);
                    expect(b.y, `${b.id} top edge`).toBeGreaterThanOrEqual(0);
                    expect(b.x + b.width, `${b.id} right edge`).toBeLessThanOrEqual(viewport.width);
                    expect(b.y + b.height, `${b.id} bottom edge`).toBeLessThanOrEqual(viewport.height);
                }
                for (const [i, a] of boxes.entries()) {
                    for (const b of boxes.slice(i + 1)) {
                        expect(intersects(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
                    }
                }
            });
        }
    }
});
