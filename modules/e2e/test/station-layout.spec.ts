import { cleanupPageState, navigateToScreen, setupPageErrorHandlers } from './test-infrastructure';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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

/** Panes appear asynchronously; wait until their boxes stop changing for three consecutive looks. */
async function waitForSettledLayout(page: Page) {
    let previous = '';
    let stableLooks = 0;
    await expect
        .poll(
            async () => {
                const current = await page.evaluate(() =>
                    [...document.querySelectorAll('.tp-rotv[data-id], [data-id="Armor"], [data-id="Damage"]')]
                        .map((el) => {
                            const r = el.getBoundingClientRect();
                            return [el.getAttribute('data-id'), r.x, r.y, r.width, r.height]
                                .map((v) => (typeof v === 'number' ? Math.round(v) : v))
                                .join();
                        })
                        .join('|'),
                );
                stableLooks = current === previous ? stableLooks + 1 : 0;
                previous = current;
                return stableLooks;
            },
            { intervals: [300], timeout: 10000 },
        )
        .toBeGreaterThanOrEqual(3);
}

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
                await waitForSettledLayout(page);
                const boxes = await page.evaluate((): Box[] => {
                    const topLevel = (el: Element) => !el.parentElement?.closest('.tp-rotv');
                    return [...document.querySelectorAll('[data-id]')]
                        .filter((el) => {
                            const id = el.getAttribute('data-id');
                            const isPane = el.classList.contains('tp-rotv');
                            return (isPane || id === 'Damage' || id === 'Armor') && topLevel(el);
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
                        const sharesColumn = a.x < b.x + b.width && b.x < a.x + a.width;
                        const gap = a.y < b.y ? b.y - (a.y + a.height) : a.y - (b.y + b.height);
                        if (sharesColumn) {
                            expect(gap, `${a.id} and ${b.id} are stacked with no gap`).toBeGreaterThanOrEqual(10);
                        }
                    }
                }
            });
        }
    }
    for (const station of stations) {
        test(`${station} shows all its content at 1024x768`, async ({ page }) => {
            setupPageErrorHandlers(page);
            await page.setViewportSize({ width: 1024, height: 768 });
            await navigateToScreen(page, `/${station}.html?ship=${shipId}`, { baseURL: gameDriver.baseURL });
            await expect(page.locator('.tp-rotv[data-id]').first()).toBeVisible({ timeout: 10000 });
            await waitForSettledLayout(page);
            const hidden = await page.evaluate((): string[] => {
                const problems: string[] = [];
                const panes = [...document.querySelectorAll('.tp-rotv[data-id]')].filter(
                    (el) => !el.parentElement?.closest('.tp-rotv'),
                );
                for (const pane of panes) {
                    const id = pane.getAttribute('data-id');
                    const full = pane.getBoundingClientRect();
                    if (full.width === 0 || full.height === 0) continue;
                    if (pane.scrollHeight > pane.clientHeight + 1) problems.push(`${id}: content taller than pane`);
                    if (pane.scrollWidth > pane.clientWidth + 1) problems.push(`${id}: content wider than pane`);
                    for (let a = pane.parentElement; a && a.id !== 'wrapper'; a = a.parentElement) {
                        const { overflowX, overflowY } = getComputedStyle(a);
                        if (overflowX === 'visible' && overflowY === 'visible') continue;
                        const c = a.getBoundingClientRect();
                        if (full.bottom > c.bottom + 1) problems.push(`${id}: cut off at the bottom of its slot`);
                        if (full.right > c.right + 1) problems.push(`${id}: cut off at the right of its slot`);
                    }
                    const paneStyle = getComputedStyle(pane);
                    const contentRight =
                        full.right - parseFloat(paneStyle.paddingRight) - parseFloat(paneStyle.borderRightWidth);
                    for (const el of pane.querySelectorAll('*')) {
                        const r = el.getBoundingClientRect();
                        if (r.width === 0 || r.height === 0 || getComputedStyle(el).display === 'none') continue;
                        if (r.right > contentRight + 1) {
                            const name = el.classList.contains('sw-ann')
                                ? `annunciator "${el.textContent}"`
                                : `${el.tagName.toLowerCase()}.${el.className}`;
                            problems.push(`${id}: ${name} extends past the pane content box`);
                        }
                    }
                    // annunciators sit in the same content column as the bars and share their row in equal cells
                    const pad = parseFloat(paneStyle.getPropertyValue('--sw-pad'));
                    const rows = new Map<Element, number[]>();
                    for (const ann of pane.querySelectorAll('.sw-ann')) {
                        const r = ann.getBoundingClientRect();
                        if (r.width === 0) continue;
                        if (r.left < full.left + pad - 1 || r.right > full.right - pad + 1) {
                            problems.push(`${id}: annunciator "${ann.textContent}" is outside the pane content box`);
                        }
                        rows.set(ann.parentElement as Element, [
                            ...(rows.get(ann.parentElement as Element) ?? []),
                            r.width,
                        ]);
                    }
                    for (const widths of rows.values()) {
                        if (Math.max(...widths) - Math.min(...widths) > 1) {
                            problems.push(`${id}: annunciators in one row have unequal widths ${widths.join()}`);
                        }
                    }
                    for (const value of pane.querySelectorAll('input, select')) {
                        if (
                            value.clientWidth > 1 &&
                            getComputedStyle(value).color !== 'rgba(0, 0, 0, 0)' &&
                            value.scrollWidth > value.clientWidth + 1
                        ) {
                            const text = value instanceof HTMLInputElement ? value.value : value.textContent;
                            problems.push(`${id}: value "${text}" truncated`);
                        }
                    }
                    for (const label of pane.querySelectorAll('.tp-lblv_l')) {
                        if (label.clientWidth > 1 && label.scrollWidth > label.clientWidth + 1) {
                            problems.push(`${id}: label "${label.textContent}" truncated`);
                        }
                    }
                }
                return problems;
            });
            expect(hidden).toEqual([]);
        });
    }
});
