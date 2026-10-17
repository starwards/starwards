import { Page } from '@playwright/test';
import { monitorEventLoopDelay } from 'node:perf_hooks';

// TEMPORARY (#2407): measures where the target-details lag comes from. Remove with the fix.
declare global {
    interface Window {
        __probe?: { maxGap: number; gaps250: number; longTaskMs: number; longTasks: number; t0: number };
    }
}

function installPageProbe() {
    const p = { maxGap: 0, gaps250: 0, longTaskMs: 0, longTasks: 0, t0: performance.now() };
    window.__probe = p;
    let last = performance.now();
    setInterval(() => {
        const now = performance.now();
        const gap = now - last - 50;
        last = now;
        if (gap > p.maxGap) p.maxGap = gap;
        if (gap > 250) p.gaps250++;
    }, 50);
    try {
        new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                p.longTasks++;
                p.longTaskMs += e.duration;
            }
        }).observe({ type: 'longtask', buffered: true });
    } catch {
        // longtask unsupported
    }
}

export function probePage(page: Page, name: string) {
    const frames: number[] = [];
    void page.addInitScript(installPageProbe);
    page.on('websocket', (ws) => ws.on('framereceived', () => frames.push(Date.now())));
    return {
        name,
        async report(since: number) {
            const inPage = await page
                .evaluate(() => {
                    const p = window.__probe;
                    return p && { ...p, maxGap: Math.round(p.maxGap), longTaskMs: Math.round(p.longTaskMs) };
                })
                .catch((e: unknown) => String(e));
            const recent = frames.filter((t) => t >= since);
            let maxFrameGap = 0;
            for (let i = 1; i < recent.length; i++) maxFrameGap = Math.max(maxFrameGap, recent[i] - recent[i - 1]);
            return { name, inPage, wsFramesSince: recent.length, maxWsFrameGapMs: maxFrameGap };
        },
    };
}

export function probeNode() {
    const h = monitorEventLoopDelay({ resolution: 10 });
    h.enable();
    return {
        report() {
            const r = { nodeLoopP99Ms: Math.round(h.percentile(99) / 1e6), nodeLoopMaxMs: Math.round(h.max / 1e6) };
            h.reset();
            return r;
        },
    };
}
