import { killedAt, meanDistance, shellsFired } from './metrics';
import { Store } from './store';

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckResult {
    readonly name: string;
    readonly status: CheckStatus;
    readonly t: number | null;
    readonly detail: unknown;
}

interface CheckParams {
    readonly shellsDamageArmorMinShells: number;
    readonly shellsDamageArmorMaxRangeM: number;
    readonly stripToKillSeconds: number;
}

const DEFAULT_CHECK_PARAMS: CheckParams = {
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
    { name: 'fire_within_range', description: "any fire window with mean distance beyond the gun's max range" },
    { name: 'shells_damage_armor', description: 'shells fired in range but no plate health lost' },
    { name: 'strip_leads_to_kill', description: 'armor stripped but no kill within stripToKillSeconds' },
    { name: 'player_stays_mobile', description: 'player speed 0 at end with no propulsion break' },
    { name: 'frames_regular', description: 'frame t gaps deviate from interval_s by more than one frame' },
];

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
            const mean = await meanDistance(store, runId, roles.player, roles.target, windowStart, ev.t);
            if (mean > maxRange) {
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

async function shellsDamageArmor(
    store: Store,
    runId: string,
    roles: RoleIds,
    params: CheckParams,
): Promise<CheckResult> {
    if (!roles.player || !roles.target) {
        return { name: 'shells_damage_armor', status: 'skip', t: null, detail: 'no player/target role' };
    }
    const plateHealthRows = await store.all<{ path: string; t: number; num: number | null }>(
        `SELECT path, t, num FROM value WHERE run_id = ? AND object_id = ? AND path LIKE '/armor/armorPlates/%/layers/%/health' ORDER BY path, t`,
        runId,
        roles.target,
    );
    const shells = await shellsFired(store, runId, roles.player);
    // Total plate-health lost: sum of (first - last) reading per layer path across the run.
    const firstByPath = new Map<string, number>();
    const lastByPath = new Map<string, number>();
    for (const row of plateHealthRows) {
        if (!firstByPath.has(row.path)) {
            firstByPath.set(row.path, row.num ?? 0);
        }
        lastByPath.set(row.path, row.num ?? lastByPath.get(row.path) ?? 0);
    }
    const plateHealthDelta = [...firstByPath.entries()].reduce(
        (sum, [path, first]) => sum + (first - (lastByPath.get(path) ?? first)),
        0,
    );
    const distance = await meanDistance(store, runId, roles.player, roles.target);
    const detail = { shellsFired: shells, meanDistance: distance, plateHealthDelta };
    const inRange = distance <= params.shellsDamageArmorMaxRangeM;
    if (shells >= params.shellsDamageArmorMinShells && inRange && Math.abs(plateHealthDelta) < 1e-6) {
        return { name: 'shells_damage_armor', status: 'fail', t: null, detail };
    }
    return { name: 'shells_damage_armor', status: 'pass', t: null, detail };
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
    const killed = await killedAt(store, runId, roles.target);
    const killedInTime = killed !== null && killed <= strippedAt + params.stripToKillSeconds;
    if (!killedInTime) {
        return {
            name: 'strip_leads_to_kill',
            status: 'fail',
            t: strippedAt,
            detail: { strippedAt, killedAt: killed, limitSeconds: params.stripToKillSeconds },
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
