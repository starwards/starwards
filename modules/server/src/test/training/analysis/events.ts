import { Store } from './store';

interface EventThresholds {
    /** Multiple of an object's median per-frame speed delta that counts as a `velocity_spike`. */
    readonly velocitySpikeFactor: number;
    /** Metres below which player/target counts as `proximity`. */
    readonly proximityMetres: number;
    /** `healthRatio`-equivalent thresholds crossed downward for `health_threshold` (proxy: `systemKillRatio`, see dictionary.ts). */
    readonly healthThresholds: readonly number[];
}

const DEFAULT_THRESHOLDS: EventThresholds = {
    velocitySpikeFactor: 3,
    proximityMetres: 500,
    healthThresholds: [0.75, 0.5, 0.25, 0.05],
};

interface Row {
    readonly object_id: string;
    readonly path: string;
    readonly t: number;
    readonly num: number | null;
    readonly str: string | null;
    readonly bool: boolean | null;
}

/**
 * Events are collected here and flushed once with `Store.insertRows` rather than awaited one at a
 * time -- a run with many armor/system/fire edges can produce thousands of rows, and one DuckDB
 * round trip per row dominates `computeEvents`' cost otherwise.
 */
class EventBatch {
    private readonly rows: unknown[][] = [];

    add(runId: string, t: number, kind: string, objectId: string | null, detail: unknown): void {
        this.rows.push([runId, t, kind, objectId, 'derived', JSON.stringify(detail)]);
    }

    async flush(store: Store): Promise<void> {
        await store.insertRows('event', 6, this.rows);
        this.rows.length = 0;
    }
}

function median(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Derives the `event` table from `value` deltas after ingest. Deterministic: same store + same
 * thresholds always produce the same events. Thresholds are recorded into each event's
 * `detail_json` so a re-run with different ones is distinguishable.
 */
export async function computeEvents(
    store: Store,
    runId: string,
    thresholds: EventThresholds = DEFAULT_THRESHOLDS,
): Promise<void> {
    await store.run('DELETE FROM event WHERE run_id = ?', runId);
    const batch = new EventBatch();
    const objects = await store.all<{ object_id: string; type: string; first_t: number; last_t: number }>(
        'SELECT object_id, type, first_t, last_t FROM object WHERE run_id = ?',
        runId,
    );
    for (const obj of objects) {
        batch.add(runId, obj.first_t, 'spawn', obj.object_id, { type: obj.type });
    }
    const lastT = (await store.all<{ t: number }>('SELECT max(t) AS t FROM frame WHERE run_id = ?', runId))[0]?.t;
    for (const obj of objects) {
        if (lastT !== undefined && obj.last_t < lastT) {
            batch.add(runId, obj.last_t, 'despawn', obj.object_id, { type: obj.type });
        }
    }

    // `armor`/`chainGuns`/`magazine`/systems and the drift/proximity checks only ever concern
    // ships -- a T0-scale run can have hundreds of shell/explosion objects, and running these
    // per-object queries against every one of them (they'd all just come back empty) dominates
    // computeEvents' cost for no events gained.
    const ships = objects.filter((obj) => obj.type === 'Spaceship');
    for (const obj of ships) {
        await computeBooleanEdges(store, batch, runId, obj.object_id, '/destroyed', 'destroyed', undefined);
        await computeArrayBrokenEvents(store, batch, runId, obj.object_id);
        await computeFireEvents(store, batch, runId, obj.object_id);
        await computeAmmoEmpty(store, batch, runId, obj.object_id);
        await computeSystemBrokenEvents(store, batch, runId, obj.object_id);
        await computeHealthThresholds(store, batch, runId, obj.object_id, thresholds.healthThresholds);
        await computeVelocitySpikes(store, batch, runId, obj.object_id, thresholds.velocitySpikeFactor);
    }

    const roles = await store.all<{ object_id: string; role: string }>(
        'SELECT object_id, role FROM object WHERE run_id = ? AND role IS NOT NULL',
        runId,
    );
    const player = roles.find((r) => r.role === 'player')?.object_id;
    const target = roles.find((r) => r.role === 'target')?.object_id;
    if (player && target) {
        await computeProximity(store, batch, runId, player, target, thresholds.proximityMetres);
    }

    await batch.flush(store);
}

async function computeBooleanEdges(
    store: Store,
    batch: EventBatch,
    runId: string,
    objectId: string,
    path: string,
    kindOn: string,
    kindOff?: string,
): Promise<void> {
    const rows = await store.all<Row>(
        'SELECT object_id, path, t, num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = ? ORDER BY t',
        runId,
        objectId,
        path,
    );
    for (const row of rows) {
        if (row.bool === true) {
            batch.add(runId, row.t, kindOn, objectId, { path });
        } else if (row.bool === false && kindOff) {
            batch.add(runId, row.t, kindOff, objectId, { path });
        }
    }
}

/** `plate_broken` per plate reaching 0 layer health, and `armor_stripped` when the last plate goes. */
async function computeArrayBrokenEvents(
    store: Store,
    batch: EventBatch,
    runId: string,
    objectId: string,
): Promise<void> {
    const rows = await store.all<Row>(
        `SELECT object_id, path, t, num, str, bool FROM value
         WHERE run_id = ? AND object_id = ? AND path LIKE '/armor/armorPlates/%/layers/%/health'
         ORDER BY t`,
        runId,
        objectId,
    );
    if (rows.length === 0) {
        return;
    }
    const plateCount = new Set(rows.map((r) => r.path.split('/')[3])).size;
    const layerHealth = new Map<string, number>(); // "plate/layer" -> health
    const plateLayers = new Map<string, Set<string>>(); // plate -> set of layer indices seen
    const brokenPlates = new Set<string>();
    for (const row of rows) {
        const [, , , plate, , layer] = row.path.split('/');
        const layerKey = `${plate}/${layer}`;
        layerHealth.set(layerKey, row.num ?? 0);
        if (!plateLayers.has(plate)) {
            plateLayers.set(plate, new Set());
        }
        plateLayers.get(plate)?.add(layer);
        const layers = plateLayers.get(plate) ?? new Set();
        const allZero = [...layers].every((l) => (layerHealth.get(`${plate}/${l}`) ?? 1) <= 0);
        if (allZero && !brokenPlates.has(plate)) {
            brokenPlates.add(plate);
            batch.add(runId, row.t, 'plate_broken', objectId, { plate: Number(plate) });
            if (brokenPlates.size === plateCount) {
                batch.add(runId, row.t, 'armor_stripped', objectId, { plates: plateCount });
            }
        }
    }
}

async function computeFireEvents(store: Store, batch: EventBatch, runId: string, objectId: string): Promise<void> {
    const rows = await store.all<Row>(
        `SELECT object_id, path, t, num, str, bool FROM value
         WHERE run_id = ? AND object_id = ? AND path LIKE '/chainGuns/%/isFiring' ORDER BY path, t`,
        runId,
        objectId,
    );
    // The store's delta encoding writes every path's value on the first frame it is seen, which
    // is a baseline, not an edge -- skip each gun's first row so a gun that starts (or stays)
    // silent for the whole run never emits a spurious fire_stop.
    const seen = new Set<string>();
    for (const row of rows) {
        const gun = Number(row.path.split('/')[2]);
        if (!seen.has(row.path)) {
            seen.add(row.path);
            continue;
        }
        if (row.bool === true) {
            batch.add(runId, row.t, 'fire_start', objectId, { gun });
        } else if (row.bool === false) {
            batch.add(runId, row.t, 'fire_stop', objectId, { gun });
        }
    }
}

async function computeAmmoEmpty(store: Store, batch: EventBatch, runId: string, objectId: string): Promise<void> {
    const rows = await store.all<Row>(
        `SELECT object_id, path, t, num, str, bool FROM value
         WHERE run_id = ? AND object_id = ? AND path LIKE '/magazine/count_%' ORDER BY t`,
        runId,
        objectId,
    );
    for (const row of rows) {
        if ((row.num ?? 1) <= 0) {
            batch.add(runId, row.t, 'ammo_empty', objectId, { path: row.path });
        }
    }
}

async function computeSystemBrokenEvents(
    store: Store,
    batch: EventBatch,
    runId: string,
    objectId: string,
): Promise<void> {
    const rows = await store.all<Row>(
        `SELECT object_id, path, t, num, str, bool FROM value
         WHERE run_id = ? AND object_id = ? AND path LIKE '%/broken' ORDER BY path, t`,
        runId,
        objectId,
    );
    // Same first-frame-is-a-baseline-not-an-edge reasoning as computeFireEvents.
    const seen = new Set<string>();
    for (const row of rows) {
        const system = row.path.split('/').slice(0, -1).join('/');
        if (!seen.has(row.path)) {
            seen.add(row.path);
            continue;
        }
        if (row.bool === true) {
            batch.add(runId, row.t, 'system_broken', objectId, { system });
        } else if (row.bool === false) {
            batch.add(runId, row.t, 'system_repaired', objectId, { system });
        }
    }
}

async function computeHealthThresholds(
    store: Store,
    batch: EventBatch,
    runId: string,
    objectId: string,
    thresholds: readonly number[],
): Promise<void> {
    const rows = await store.all<Row>(
        `SELECT object_id, path, t, num, str, bool FROM value
         WHERE run_id = ? AND object_id = ? AND path = '/healthRatio' ORDER BY t`,
        runId,
        objectId,
    );
    let prevHealth = 1;
    for (const row of rows) {
        const health = row.num ?? prevHealth;
        for (const threshold of thresholds) {
            if (prevHealth >= threshold && health < threshold) {
                batch.add(runId, row.t, 'health_threshold', objectId, { threshold });
            }
        }
        prevHealth = health;
    }
}

async function computeVelocitySpikes(
    store: Store,
    batch: EventBatch,
    runId: string,
    objectId: string,
    factor: number,
): Promise<void> {
    const [vx, vy] = await Promise.all([
        store.all<Row>(
            "SELECT object_id, path, t, num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = '/velocity/x' ORDER BY t",
            runId,
            objectId,
        ),
        store.all<Row>(
            "SELECT object_id, path, t, num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = '/velocity/y' ORDER BY t",
            runId,
            objectId,
        ),
    ]);
    const frames = await store.all<{ t: number }>('SELECT t FROM frame WHERE run_id = ? ORDER BY t', runId);
    if (frames.length < 2) {
        return;
    }
    // Forward-fill both components across frame times in one pass (both `vx`/`vy` and `frames`
    // are already sorted by `t`), instead of re-scanning from the start for every frame.
    const speeds = forwardFillSpeeds(frames, vx, vy);
    const deltas = speeds.slice(1).map((s, i) => Math.abs(s.speed - speeds[i].speed));
    const medianDelta = median(deltas);
    const threshold = medianDelta * factor;
    if (threshold <= 0) {
        return;
    }
    for (let i = 1; i < speeds.length; i++) {
        const delta = Math.abs(speeds[i].speed - speeds[i - 1].speed);
        if (delta > threshold) {
            batch.add(runId, speeds[i].t, 'velocity_spike', objectId, { delta, threshold, medianDelta });
        }
    }
}

function forwardFillSpeeds(
    frames: readonly { t: number }[],
    vx: readonly Row[],
    vy: readonly Row[],
): Array<{ t: number; speed: number }> {
    let xi = 0;
    let yi = 0;
    let x = 0;
    let y = 0;
    return frames.map((f) => {
        while (xi < vx.length && vx[xi].t <= f.t) {
            x = vx[xi].num ?? x;
            xi++;
        }
        while (yi < vy.length && vy[yi].t <= f.t) {
            y = vy[yi].num ?? y;
            yi++;
        }
        return { t: f.t, speed: Math.hypot(x, y) };
    });
}

async function computeProximity(
    store: Store,
    batch: EventBatch,
    runId: string,
    playerId: string,
    targetId: string,
    thresholdMetres: number,
): Promise<void> {
    const frames = await store.all<{ t: number }>('SELECT t FROM frame WHERE run_id = ? ORDER BY t', runId);
    const [px, py, tx, ty] = await Promise.all([
        store.all<Row>(
            "SELECT object_id, path, t, num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = '/position/x' ORDER BY t",
            runId,
            playerId,
        ),
        store.all<Row>(
            "SELECT object_id, path, t, num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = '/position/y' ORDER BY t",
            runId,
            playerId,
        ),
        store.all<Row>(
            "SELECT object_id, path, t, num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = '/position/x' ORDER BY t",
            runId,
            targetId,
        ),
        store.all<Row>(
            "SELECT object_id, path, t, num, str, bool FROM value WHERE run_id = ? AND object_id = ? AND path = '/position/y' ORDER BY t",
            runId,
            targetId,
        ),
    ]);
    if (px.length === 0 || py.length === 0 || tx.length === 0 || ty.length === 0) {
        return;
    }
    // Forward-fill all four series across frame times in one pass, like computeVelocitySpikes.
    let pxi = 0;
    let pyi = 0;
    let txi = 0;
    let tyi = 0;
    let pxv = 0;
    let pyv = 0;
    let txv = 0;
    let tyv = 0;
    let wasInRange = false;
    for (const f of frames) {
        while (pxi < px.length && px[pxi].t <= f.t) {
            pxv = px[pxi].num ?? pxv;
            pxi++;
        }
        while (pyi < py.length && py[pyi].t <= f.t) {
            pyv = py[pyi].num ?? pyv;
            pyi++;
        }
        while (txi < tx.length && tx[txi].t <= f.t) {
            txv = tx[txi].num ?? txv;
            txi++;
        }
        while (tyi < ty.length && ty[tyi].t <= f.t) {
            tyv = ty[tyi].num ?? tyv;
            tyi++;
        }
        const distance = Math.hypot(pxv - txv, pyv - tyv);
        const inRange = distance < thresholdMetres;
        if (inRange && !wasInRange) {
            batch.add(runId, f.t, 'proximity', playerId, { distance, thresholdMetres, targetId });
        }
        wasInRange = inRange;
    }
}
