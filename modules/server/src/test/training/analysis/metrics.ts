import { Store } from './store';

/**
 * Metric primitives over an ingested recording -- the one implementation each consumer
 * (`extract.ts`, `checks.ts`, the report writers) calls, so no metric is defined twice.
 */

/** Median of the finite values; `NaN` when there are none. */
export function median(values: readonly number[]): number {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) {
        return NaN;
    }
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function lastFrameT(store: Store, runId: string): Promise<number> {
    return (await store.all<{ t: number }>('SELECT max(t) AS t FROM frame WHERE run_id = ?', runId))[0]?.t ?? 0;
}

/**
 * When `objectId` died, or `null` if it lived to the end: its first `destroyed` or `despawn` event
 * (`computeEvents` must have run). Snapshots drop destroyed objects (`HeadlessGame.saveGame`), so a
 * kill usually shows as a despawn; `destroyed` only appears when a frame caught the flag first.
 */
export async function killedAt(store: Store, runId: string, objectId: string): Promise<number | null> {
    const rows = await store.all<{ t: number }>(
        "SELECT t FROM event WHERE run_id = ? AND object_id = ? AND kind IN ('destroyed', 'despawn') ORDER BY t LIMIT 1",
        runId,
        objectId,
    );
    return rows[0]?.t ?? null;
}

/** Shell rounds `objectId` spent (missiles excluded): magazine drop per shell type, first to last reading. */
export async function shellsFired(store: Store, runId: string, objectId: string): Promise<number> {
    const rows = await store.all<{ path: string; num: number | null }>(
        `SELECT path, num FROM value WHERE run_id = ? AND object_id = ?
         AND path IN ('/magazine/count_HiExpShell', '/magazine/count_ArmPenShell', '/magazine/count_FragShell')
         ORDER BY path, t`,
        runId,
        objectId,
    );
    const first = new Map<string, number>();
    const last = new Map<string, number>();
    for (const row of rows) {
        if (!first.has(row.path)) {
            first.set(row.path, row.num ?? 0);
        }
        last.set(row.path, row.num ?? last.get(row.path) ?? 0);
    }
    return [...first].reduce((sum, [path, start]) => sum + Math.max(0, start - (last.get(path) ?? start)), 0);
}

async function seriesRows(store: Store, runId: string, objectId: string, path: string) {
    return store.all<{ t: number; num: number | null }>(
        'SELECT t, num FROM value WHERE run_id = ? AND object_id = ? AND path = ? ORDER BY t',
        runId,
        objectId,
        path,
    );
}

/**
 * Mean distance between `a` and `b` over the frames in [`fromT`, `untilT`] (default: all), each
 * position forward-filled from its latest delta. `NaN` without position data or frames in range.
 */
export async function meanDistance(
    store: Store,
    runId: string,
    a: string,
    b: string,
    fromT = -Infinity,
    untilT = Infinity,
): Promise<number> {
    const frames = await store.all<{ t: number }>('SELECT t FROM frame WHERE run_id = ? ORDER BY t', runId);
    const series = await Promise.all([
        seriesRows(store, runId, a, '/position/x'),
        seriesRows(store, runId, a, '/position/y'),
        seriesRows(store, runId, b, '/position/x'),
        seriesRows(store, runId, b, '/position/y'),
    ]);
    if (series.some((s) => !s.length)) {
        return NaN;
    }
    const cursor = [0, 0, 0, 0];
    const value = [0, 0, 0, 0];
    let sum = 0;
    let count = 0;
    for (const f of frames) {
        if (f.t > untilT) {
            break;
        }
        series.forEach((rows, i) => {
            while (cursor[i] < rows.length && rows[cursor[i]].t <= f.t) {
                value[i] = rows[cursor[i]++].num ?? value[i];
            }
        });
        if (f.t < fromT) {
            continue;
        }
        sum += Math.hypot(value[0] - value[2], value[1] - value[3]);
        count++;
    }
    return count ? sum / count : NaN;
}

/**
 * Seconds with at least one of `objectId`'s guns firing -- the union over guns, not their sum.
 * Tick-exact when the run left a recorder sidecar (see `computeEvents`), frame-resolution otherwise.
 */
export async function secondsFiring(store: Store, runId: string, objectId: string): Promise<number> {
    const lastT = await lastFrameT(store, runId);
    const events = await store.all<{ t: number; kind: string; detail_json: string }>(
        "SELECT t, kind, detail_json FROM event WHERE run_id = ? AND object_id = ? AND kind IN ('fire_start','fire_stop') ORDER BY t",
        runId,
        objectId,
    );
    let total = 0;
    let openAt: number | null = null;
    const openGuns = new Set<number>();
    for (const ev of events) {
        const gun = (JSON.parse(ev.detail_json) as { gun?: number }).gun ?? 0;
        if (ev.kind === 'fire_start') {
            openGuns.add(gun);
            openAt ??= ev.t;
        } else if (openGuns.delete(gun) && openGuns.size === 0 && openAt !== null) {
            total += ev.t - openAt;
            openAt = null;
        }
    }
    return openAt === null ? total : total + lastT - openAt;
}

/** Distinct explosions that ever overlapped `objectId`, from the recorder's sidecar; 0 without one. */
export async function blastHits(store: Store, runId: string, objectId: string): Promise<number> {
    const rows = await store.all<{ n: number }>(
        "SELECT count(DISTINCT json_extract_string(detail_json, '$.explosionId'))::INTEGER AS n FROM event WHERE run_id = ? AND object_id = ? AND kind = 'blast_hit'",
        runId,
        objectId,
    );
    return rows[0]?.n ?? 0;
}
