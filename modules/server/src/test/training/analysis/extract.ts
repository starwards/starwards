import { Store } from './store';

/**
 * The subset of `TrainingResult` computed from a finished store instead of inline in the run
 * loop -- one implementation, used both by `analyze` and by `runTraining` when recording is on
 * (see training-scenarios.ts). Field names and meanings match `TrainingResult` exactly so a
 * parity fixture can assert equality against the deleted inline code.
 */
interface ExtractedMetrics {
    readonly killed: boolean;
    readonly seconds: number;
    readonly armorStrippedAt: number | null;
    readonly targetHealth: number;
    readonly shellsFired: number;
    readonly secondsFiring: number;
    readonly meanDistance: number;
    readonly targetDrift: number;
    readonly gvtsSpeed: number;
}

interface ExtractRoles {
    readonly playerId: string;
    readonly targetId: string;
}

async function seriesRows(
    store: Store,
    runId: string,
    objectId: string,
    path: string,
): Promise<Array<{ t: number; num: number | null }>> {
    return store.all<{ t: number; num: number | null }>(
        'SELECT t, num FROM value WHERE run_id = ? AND object_id = ? AND path = ? ORDER BY t',
        runId,
        objectId,
        path,
    );
}

export async function extractMetrics(store: Store, runId: string, roles: ExtractRoles): Promise<ExtractedMetrics> {
    const lastT = (await store.all<{ t: number }>('SELECT max(t) AS t FROM frame WHERE run_id = ?', runId))[0]?.t ?? 0;

    const destroyedRow = await store.valueAt(runId, roles.targetId, '/destroyed', lastT);
    // Snapshots drop destroyed objects (`saveGame`), so a kill usually shows as the target's
    // absence from later frames rather than as `/destroyed` = true.
    const targetLastSeen = (
        await store.all<{ last_t: number }>(
            'SELECT last_t FROM object WHERE run_id = ? AND object_id = ?',
            runId,
            roles.targetId,
        )
    )[0]?.last_t;
    const killed = destroyedRow?.bool === true || (targetLastSeen !== undefined && targetLastSeen < lastT);

    const strippedRows = await store.all<{ t: number }>(
        "SELECT t FROM event WHERE run_id = ? AND object_id = ? AND kind = 'armor_stripped' ORDER BY t LIMIT 1",
        runId,
        roles.targetId,
    );
    const armorStrippedAt = strippedRows[0]?.t ?? null;

    const targetHealth = killed ? 0 : ((await store.valueAt(runId, roles.targetId, '/healthRatio', lastT))?.num ?? 1);

    // Matches the deleted inline loop's `shells()`: shell rounds only, not missiles.
    const magazineRows = await store.all<{ path: string; t: number; num: number | null }>(
        `SELECT path, t, num FROM value WHERE run_id = ? AND object_id = ?
         AND path IN ('/magazine/count_HiExpShell', '/magazine/count_ArmPenShell', '/magazine/count_FragShell')
         ORDER BY path, t`,
        runId,
        roles.playerId,
    );
    const firstByPath = new Map<string, number>();
    const lastByPath = new Map<string, number>();
    for (const row of magazineRows) {
        if (!firstByPath.has(row.path)) {
            firstByPath.set(row.path, row.num ?? 0);
        }
        lastByPath.set(row.path, row.num ?? lastByPath.get(row.path) ?? 0);
    }
    const shellsFired = [...firstByPath.entries()].reduce(
        (sum, [path, first]) => sum + Math.max(0, first - (lastByPath.get(path) ?? first)),
        0,
    );

    const fireEvents = await store.all<{ t: number; kind: string }>(
        "SELECT t, kind FROM event WHERE run_id = ? AND object_id = ? AND kind IN ('fire_start','fire_stop') ORDER BY t",
        runId,
        roles.playerId,
    );
    let secondsFiring = 0;
    let openAt: number | null = null;
    for (const ev of fireEvents) {
        if (ev.kind === 'fire_start') {
            openAt ??= ev.t;
        } else if (ev.kind === 'fire_stop' && openAt !== null) {
            secondsFiring += ev.t - openAt;
            openAt = null;
        }
    }
    if (openAt !== null) {
        secondsFiring += lastT - openAt;
    }

    // Forward-fill both objects' positions across frame times in one pass instead of four
    // sequential `valueAt` round trips per frame -- the latter dominates extract's cost on a
    // tick-exact recording (thousands of frames).
    const frames = await store.all<{ t: number }>('SELECT t FROM frame WHERE run_id = ? ORDER BY t', runId);
    const [px, py, tx, ty] = await Promise.all([
        seriesRows(store, runId, roles.playerId, '/position/x'),
        seriesRows(store, runId, roles.playerId, '/position/y'),
        seriesRows(store, runId, roles.targetId, '/position/x'),
        seriesRows(store, runId, roles.targetId, '/position/y'),
    ]);
    let distanceSum = 0;
    let distanceTicks = 0;
    if (px.length && py.length && tx.length && ty.length) {
        let pxi = 0;
        let pyi = 0;
        let txi = 0;
        let tyi = 0;
        let pxv = 0;
        let pyv = 0;
        let txv = 0;
        let tyv = 0;
        for (const f of frames) {
            while (pxi < px.length && px[pxi].t <= f.t) pxv = px[pxi++].num ?? pxv;
            while (pyi < py.length && py[pyi].t <= f.t) pyv = py[pyi++].num ?? pyv;
            while (txi < tx.length && tx[txi].t <= f.t) txv = tx[txi++].num ?? txv;
            while (tyi < ty.length && ty[tyi].t <= f.t) tyv = ty[tyi++].num ?? tyv;
            distanceSum += Math.hypot(pxv - txv, pyv - tyv);
            distanceTicks++;
        }
    }
    const meanDistance = distanceTicks ? distanceSum / distanceTicks : NaN;

    const spawnX = (await store.valueAt(runId, roles.targetId, '/position/x', 0))?.num ?? 0;
    const spawnY = (await store.valueAt(runId, roles.targetId, '/position/y', 0))?.num ?? 0;
    const endX = (await store.valueAt(runId, roles.targetId, '/position/x', lastT))?.num ?? spawnX;
    const endY = (await store.valueAt(runId, roles.targetId, '/position/y', lastT))?.num ?? spawnY;
    const targetDrift = Math.hypot(endX - spawnX, endY - spawnY);

    const [gvx, gvy] = await Promise.all([
        store.valueAt(runId, roles.playerId, '/velocity/x', lastT),
        store.valueAt(runId, roles.playerId, '/velocity/y', lastT),
    ]);
    const gvtsSpeed = Math.hypot(gvx?.num ?? 0, gvy?.num ?? 0);

    return {
        killed,
        seconds: lastT,
        armorStrippedAt,
        targetHealth,
        shellsFired,
        secondsFiring,
        meanDistance,
        targetDrift,
        gvtsSpeed,
    };
}
