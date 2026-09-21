import { Store } from './store';

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckResult {
    readonly name: string;
    readonly status: CheckStatus;
    readonly t: number | null;
    readonly detail: unknown;
}

interface CheckParams {
    readonly targetHoldDistanceM: number;
    readonly shellsDamageArmorMinShells: number;
    readonly shellsDamageArmorMaxRangeM: number;
    readonly stripToKillSeconds: number;
}

const DEFAULT_CHECK_PARAMS: CheckParams = {
    targetHoldDistanceM: 500,
    shellsDamageArmorMinShells: 200,
    shellsDamageArmorMaxRangeM: 2000,
    stripToKillSeconds: 60,
};

interface RoleIds {
    readonly player?: string;
    readonly target?: string;
}

async function getRoles(store: Store, runId: string): Promise<RoleIds> {
    const rows = await store.all<{ object_id: string; role: string }>(
        'SELECT object_id, role FROM object WHERE run_id = ? AND role IS NOT NULL',
        runId,
    );
    return {
        player: rows.find((r) => r.role === 'player')?.object_id,
        target: rows.find((r) => r.role === 'target')?.object_id,
    };
}

async function insertCheck(store: Store, runId: string, result: CheckResult): Promise<void> {
    await store.run(
        'INSERT INTO check_result VALUES (?, ?, ?, ?, ?)',
        runId,
        result.name,
        result.status,
        result.t,
        JSON.stringify(result.detail ?? null),
    );
}

/** Runs every check in the catalogue and writes rows into `check_result`. */
export async function computeChecks(
    store: Store,
    runId: string,
    params: CheckParams = DEFAULT_CHECK_PARAMS,
): Promise<CheckResult[]> {
    await store.run('DELETE FROM check_result WHERE run_id = ?', runId);
    const roles = await getRoles(store, runId);
    const results = await Promise.all([
        targetHoldsPosition(store, runId, roles, params),
        fireWithinRange(store, runId, roles),
        shellsDamageArmor(store, runId, roles, params),
        stripLeadsToKill(store, runId, roles, params),
        playerStaysMobile(store, runId, roles),
        framesRegular(store, runId),
    ]);
    for (const r of results) {
        await insertCheck(store, runId, r);
    }
    return results;
}

export const CHECK_CATALOGUE: ReadonlyArray<{ name: string; description: string }> = [
    { name: 'target_holds_position', description: 'target moves more than targetHoldDistanceM from spawn' },
    { name: 'fire_within_range', description: "any fire window with mean distance beyond the gun's max range" },
    { name: 'shells_damage_armor', description: 'shells fired in range but no plate health lost' },
    { name: 'strip_leads_to_kill', description: 'armor stripped but no kill within stripToKillSeconds' },
    { name: 'player_stays_mobile', description: 'player speed 0 at end with no propulsion break' },
    { name: 'frames_regular', description: 'frame t gaps deviate from interval_s by more than one frame' },
];

async function targetHoldsPosition(
    store: Store,
    runId: string,
    roles: RoleIds,
    params: CheckParams,
): Promise<CheckResult> {
    if (!roles.target) {
        return { name: 'target_holds_position', status: 'skip', t: null, detail: 'no target role' };
    }
    const spawn = await Promise.all([
        store.valueAt(runId, roles.target, '/position/x', 0),
        store.valueAt(runId, roles.target, '/position/y', 0),
    ]);
    const rows = await store.all<{ t: number; num: number | null }>(
        "SELECT t, num FROM value WHERE run_id = ? AND object_id = ? AND (path = '/position/x' OR path = '/position/y') ORDER BY t",
        runId,
        roles.target,
    );
    if (!spawn[0] || !spawn[1] || rows.length === 0) {
        return { name: 'target_holds_position', status: 'skip', t: null, detail: 'no position data' };
    }
    const sx = spawn[0].num ?? 0;
    const sy = spawn[1].num ?? 0;
    let x = sx;
    let y = sy;
    const pathRows = await store.all<{ t: number; path: string; num: number | null }>(
        "SELECT t, path, num FROM value WHERE run_id = ? AND object_id = ? AND (path = '/position/x' OR path = '/position/y') ORDER BY t",
        runId,
        roles.target,
    );
    for (const row of pathRows) {
        if (row.path === '/position/x') x = row.num ?? x;
        else y = row.num ?? y;
        const drift = Math.hypot(x - sx, y - sy);
        if (drift > params.targetHoldDistanceM) {
            return {
                name: 'target_holds_position',
                status: 'fail',
                t: row.t,
                detail: { drift, limit: params.targetHoldDistanceM },
            };
        }
    }
    return { name: 'target_holds_position', status: 'pass', t: null, detail: null };
}

async function fireWithinRange(store: Store, runId: string, roles: RoleIds): Promise<CheckResult> {
    if (!roles.player || !roles.target) {
        return { name: 'fire_within_range', status: 'skip', t: null, detail: 'no player/target role' };
    }
    const fireEvents = await store.all<{ t: number; kind: string; detail_json: string }>(
        "SELECT t, kind, detail_json FROM event WHERE run_id = ? AND object_id = ? AND kind IN ('fire_start','fire_stop') ORDER BY t",
        runId,
        roles.player,
    );
    const guns = await store.all<{ max_range: number }>(
        "SELECT num AS max_range FROM value WHERE run_id = ? AND object_id = ? AND path = '/chainGuns/0/design/maxShellRange' ORDER BY t LIMIT 1",
        runId,
        roles.player,
    );
    const maxRange = guns[0]?.max_range;
    if (maxRange === undefined) {
        return { name: 'fire_within_range', status: 'skip', t: null, detail: 'no gun range data' };
    }
    let windowStart: number | null = null;
    for (const ev of fireEvents) {
        if (ev.kind === 'fire_start' && windowStart === null) {
            windowStart = ev.t;
        } else if (ev.kind === 'fire_stop' && windowStart !== null) {
            const distances = await Promise.all(
                (await sampleTimes(store, runId, windowStart, ev.t)).map((t) => distanceAt(store, runId, roles, t)),
            );
            const valid = distances.filter((d): d is number => d !== null);
            const mean = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
            if (mean !== null && mean > maxRange) {
                return {
                    name: 'fire_within_range',
                    status: 'fail',
                    t: windowStart,
                    detail: { meanDistance: mean, maxRange, windowStart, windowEnd: ev.t },
                };
            }
            windowStart = null;
        }
    }
    return { name: 'fire_within_range', status: 'pass', t: null, detail: null };
}

async function sampleTimes(store: Store, runId: string, t0: number, t1: number): Promise<number[]> {
    const frames = await store.all<{ t: number }>(
        'SELECT t FROM frame WHERE run_id = ? AND t >= ? AND t <= ? ORDER BY t',
        runId,
        t0,
        t1,
    );
    return frames.map((f) => f.t);
}

async function distanceAt(store: Store, runId: string, roles: RoleIds, t: number): Promise<number | null> {
    if (!roles.player || !roles.target) {
        return null;
    }
    const [px, py, tx, ty] = await Promise.all([
        store.valueAt(runId, roles.player, '/position/x', t),
        store.valueAt(runId, roles.player, '/position/y', t),
        store.valueAt(runId, roles.target, '/position/x', t),
        store.valueAt(runId, roles.target, '/position/y', t),
    ]);
    if (!px || !py || !tx || !ty) {
        return null;
    }
    return Math.hypot((px.num ?? 0) - (tx.num ?? 0), (py.num ?? 0) - (ty.num ?? 0));
}

async function shellsDamageArmor(
    store: Store,
    runId: string,
    roles: RoleIds,
    params: CheckParams,
): Promise<CheckResult> {
    if (!roles.player || !roles.target) {
        return { name: 'shells_damage_armor', status: 'skip', t: null, detail: 'no player/target role' };
    }
    const magazineRows = await store.all<{ t: number; path: string; num: number | null }>(
        "SELECT t, path, num FROM value WHERE run_id = ? AND object_id = ? AND path LIKE '/magazine/count_%' ORDER BY t",
        runId,
        roles.player,
    );
    const plateHealthRows = await store.all<{ path: string; t: number; num: number | null }>(
        `SELECT path, t, num FROM value WHERE run_id = ? AND object_id = ? AND path LIKE '/armor/armorPlates/%/layers/%/health' ORDER BY path, t`,
        runId,
        roles.target,
    );
    if (magazineRows.length === 0) {
        return { name: 'shells_damage_armor', status: 'skip', t: null, detail: 'no magazine data' };
    }
    const startCounts = new Map<string, number>();
    for (const row of magazineRows) {
        if (!startCounts.has(row.path)) {
            startCounts.set(row.path, row.num ?? 0);
        }
    }
    const endCounts = new Map<string, number>();
    for (const row of magazineRows) {
        endCounts.set(row.path, row.num ?? endCounts.get(row.path) ?? 0);
    }
    const shellsFired = [...startCounts.entries()].reduce(
        (sum, [path, start]) => sum + Math.max(0, start - (endCounts.get(path) ?? start)),
        0,
    );
    // Total plate-health lost: sum of (first - last) reading per layer path across the run.
    const firstByPath = new Map<string, number>();
    const lastByPath = new Map<string, number>();
    for (const row of plateHealthRows) {
        if (!firstByPath.has(row.path)) {
            firstByPath.set(row.path, row.num ?? 0);
        }
        lastByPath.set(row.path, row.num ?? lastByPath.get(row.path) ?? 0);
    }
    const totalPlateHealthDelta = [...firstByPath.entries()].reduce(
        (sum, [path, first]) => sum + (first - (lastByPath.get(path) ?? first)),
        0,
    );
    const meanDistance = await meanDistanceOverRun(store, runId, roles);
    const inRange = meanDistance !== null && meanDistance <= params.shellsDamageArmorMaxRangeM;
    if (shellsFired >= params.shellsDamageArmorMinShells && inRange && Math.abs(totalPlateHealthDelta) < 1e-6) {
        return {
            name: 'shells_damage_armor',
            status: 'fail',
            t: null,
            detail: { shellsFired, meanDistance, plateHealthDelta: totalPlateHealthDelta },
        };
    }
    return { name: 'shells_damage_armor', status: 'pass', t: null, detail: { shellsFired, meanDistance } };
}

async function meanDistanceOverRun(store: Store, runId: string, roles: RoleIds): Promise<number | null> {
    if (!roles.player || !roles.target) {
        return null;
    }
    const frames = await store.all<{ t: number }>('SELECT t FROM frame WHERE run_id = ? ORDER BY t', runId);
    if (frames.length === 0) {
        return null;
    }
    const step = Math.max(1, Math.floor(frames.length / 50));
    const sampled = frames.filter((_, i) => i % step === 0);
    const distances = (await Promise.all(sampled.map((f) => distanceAt(store, runId, roles, f.t)))).filter(
        (d): d is number => d !== null,
    );
    return distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : null;
}

async function stripLeadsToKill(
    store: Store,
    runId: string,
    roles: RoleIds,
    params: CheckParams,
): Promise<CheckResult> {
    if (!roles.target) {
        return { name: 'strip_leads_to_kill', status: 'skip', t: null, detail: 'no target role' };
    }
    const stripped = await store.all<{ t: number }>(
        "SELECT t FROM event WHERE run_id = ? AND object_id = ? AND kind = 'armor_stripped' ORDER BY t LIMIT 1",
        runId,
        roles.target,
    );
    if (stripped.length === 0) {
        return { name: 'strip_leads_to_kill', status: 'skip', t: null, detail: 'armor never stripped' };
    }
    const strippedAt = stripped[0].t;
    const destroyed = await store.all<{ t: number }>(
        "SELECT t FROM event WHERE run_id = ? AND object_id = ? AND kind = 'destroyed' ORDER BY t LIMIT 1",
        runId,
        roles.target,
    );
    const killedInTime = destroyed.length > 0 && destroyed[0].t <= strippedAt + params.stripToKillSeconds;
    if (!killedInTime) {
        return {
            name: 'strip_leads_to_kill',
            status: 'fail',
            t: strippedAt,
            detail: { strippedAt, killedAt: destroyed[0]?.t ?? null, limitSeconds: params.stripToKillSeconds },
        };
    }
    return { name: 'strip_leads_to_kill', status: 'pass', t: null, detail: null };
}

async function playerStaysMobile(store: Store, runId: string, roles: RoleIds): Promise<CheckResult> {
    if (!roles.player) {
        return { name: 'player_stays_mobile', status: 'skip', t: null, detail: 'no player role' };
    }
    const lastT = (await store.all<{ t: number }>('SELECT max(t) AS t FROM frame WHERE run_id = ?', runId))[0]?.t;
    if (lastT === undefined) {
        return { name: 'player_stays_mobile', status: 'skip', t: null, detail: 'no frames' };
    }
    const [vx, vy] = await Promise.all([
        store.valueAt(runId, roles.player, '/velocity/x', lastT),
        store.valueAt(runId, roles.player, '/velocity/y', lastT),
    ]);
    const speed = Math.hypot(vx?.num ?? 0, vy?.num ?? 0);
    if (speed > 1e-6) {
        return { name: 'player_stays_mobile', status: 'pass', t: null, detail: { speed } };
    }
    const brokenPropulsion = await store.all<{ t: number }>(
        "SELECT t FROM event WHERE run_id = ? AND object_id = ? AND kind = 'system_broken' AND detail_json LIKE '%thruster%'",
        runId,
        roles.player,
    );
    if (brokenPropulsion.length > 0) {
        return { name: 'player_stays_mobile', status: 'pass', t: null, detail: { speed, brokenPropulsion: true } };
    }
    return { name: 'player_stays_mobile', status: 'fail', t: lastT, detail: { speed } };
}

async function framesRegular(store: Store, runId: string): Promise<CheckResult> {
    const run = (
        await store.all<{ interval_s: number | null }>('SELECT interval_s FROM run WHERE run_id = ?', runId)
    )[0];
    if (!run || run.interval_s === null) {
        return { name: 'frames_regular', status: 'skip', t: null, detail: 'no interval_s' };
    }
    const frames = await store.all<{ t: number }>('SELECT t FROM frame WHERE run_id = ? ORDER BY t', runId);
    for (let i = 1; i < frames.length; i++) {
        const gap = frames[i].t - frames[i - 1].t;
        if (Math.abs(gap - run.interval_s) > run.interval_s) {
            return {
                name: 'frames_regular',
                status: 'fail',
                t: frames[i].t,
                detail: { gap, expected: run.interval_s },
            };
        }
    }
    return { name: 'frames_regular', status: 'pass', t: null, detail: null };
}
