import {
    DEFAULT_WAVE_TUNING,
    STATIONS,
    WaveDefenceTuning,
    createWaveDefenceMap,
    waveBudget,
} from '../scenarios/wave-defence';
import { HeadlessGame, SERVER_TICK_HZ } from './headless-game';
import { IdleStrategy, ShipState, Spaceship, XY } from '@starwards/core/internal';

const PLAYER_SHIP_ID = 'GVTS';
/** The proxy only chases raiders this close to some alive station -- it defends, it doesn't hunt. */
const PROXY_ENGAGE_RADIUS_METERS = 40_000;
const PROXY_DECISION_SECONDS = 1;

/** Deterministic PRNG (mulberry32), so a seed replays the same waves. */
function seededRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface WaveRecord {
    readonly wave: number;
    readonly budget: number;
    readonly hulls: number;
    readonly spawnedAt: number;
    /** Next wave's spawn, or run end. */
    endedAt: number;
    /** Each station's `healthRatio` when this wave ended; 0 once destroyed. */
    stationHealth: Record<string, number>;
}

interface RaiderRecord {
    readonly model: string;
    readonly wave: number;
    readonly spawnedAt: number;
    goneAt?: number;
    /** `killed`: its capsule was breached (combat death). `written-off`: the scenario's can't-fight / out-of-play rule. */
    fate?: 'killed' | 'written-off';
    /** The raider's ship state, kept past its manager's removal so its capsule can be read once it is gone. */
    state?: ShipState;
}

export interface RunResult {
    readonly seed: number;
    readonly waveReached: number;
    readonly defeated: boolean;
    readonly simSeconds: number;
    readonly waves: WaveRecord[];
    readonly raiders: RaiderRecord[];
    /** GVTS `healthRatio` at run end (1 = intact). */
    readonly playerHealth: number;
}

interface RunOptions {
    readonly seed: number;
    readonly tuning?: WaveDefenceTuning;
    readonly maxSimSeconds: number;
    readonly hz?: number;
}

/**
 * Crude stand-in for a crew: the GVTS on NPC automation, attacking the raider nearest to it among
 * those within {@link PROXY_ENGAGE_RADIUS_METERS} of an alive station, otherwise standing ground.
 * Untested against a human baseline -- numbers tune the game against this bot, not against crews.
 */
function drivePlayerProxy(game: HeadlessGame, raiderIds: Iterable<string>) {
    const player = game.api.getObject(PLAYER_SHIP_ID);
    const playerShip = game.api.getShip(PLAYER_SHIP_ID);
    if (!player || !playerShip) {
        return;
    }
    const stations = STATIONS.filter((s) => game.api.getShip(s.id)).map((s) => s.position);
    let best: { id: string; distance: number } | undefined;
    for (const id of raiderIds) {
        const raider = game.api.getObject(id);
        if (!raider || raider.destroyed) {
            continue;
        }
        if (!stations.some((s) => XY.distance(s, raider.position) <= PROXY_ENGAGE_RADIUS_METERS)) {
            continue;
        }
        const distance = XY.distance(player.position, raider.position);
        if (!best || distance < best.distance) {
            best = { id, distance };
        }
    }
    if (best && playerShip.state.orderTargetId !== best.id) {
        game.api.orderAttack(PLAYER_SHIP_ID, best.id);
    } else if (!best && playerShip.state.orderTargetId) {
        game.api.orderNone(PLAYER_SHIP_ID);
    }
}

function stationHealth(game: HeadlessGame): Record<string, number> {
    return Object.fromEntries(STATIONS.map((s) => [s.id, game.api.getShip(s.id)?.state.healthRatio ?? 0]));
}

export function runWaveDefence({
    seed,
    tuning = DEFAULT_WAVE_TUNING,
    maxSimSeconds,
    hz = SERVER_TICK_HZ,
}: RunOptions): RunResult {
    const waves: WaveRecord[] = [];
    const raiders = new Map<string, RaiderRecord>();
    let game: HeadlessGame | undefined;
    const now = () => game?.seconds ?? 0;
    const map = createWaveDefenceMap(seededRng(seed), tuning, (wave, shipIds) => {
        const previous = waves[waves.length - 1];
        if (previous && game) {
            previous.endedAt = now();
            previous.stationHealth = stationHealth(game);
        }
        waves.push({
            wave,
            budget: waveBudget(wave, tuning.budgetExponent),
            hulls: shipIds.length,
            spawnedAt: now(),
            endedAt: NaN,
            stationHealth: {},
        });
        for (const id of shipIds) {
            raiders.set(id, { model: '', wave, spawnedAt: now(), state: game?.api.getShip(id)?.state });
        }
    });
    game = HeadlessGame.start(map, seed);
    const player = game.api.getShip(PLAYER_SHIP_ID);
    if (player) {
        player.state.idleStrategy = IdleStrategy.STAND_GROUND;
    }

    const dt = 1 / hz;
    let sinceDecision = PROXY_DECISION_SECONDS;
    const live = new Set<string>();
    while (game.seconds < maxSimSeconds && !game.stopped) {
        for (const [id, record] of raiders) {
            if (record.goneAt === undefined) {
                live.add(id);
            }
        }
        sinceDecision += dt;
        if (sinceDecision >= PROXY_DECISION_SECONDS) {
            sinceDecision = 0;
            drivePlayerProxy(game, live);
        }
        game.tick(dt);
        for (const id of live) {
            const record = raiders.get(id);
            if (!record) {
                continue;
            }
            const object = game.api.getObject(id);
            if (object && !object.destroyed) {
                if (!record.model && Spaceship.isInstance(object)) {
                    (record as { model: string }).model = object.model ?? '';
                }
                record.state ??= game.api.getShip(id)?.state;
                continue;
            }
            record.goneAt = game.seconds;
            record.fate = record.state?.capsule.broken ? 'killed' : 'written-off';
            live.delete(id);
        }
    }
    const last = waves[waves.length - 1];
    if (last) {
        last.endedAt = game.seconds;
        last.stationHealth = stationHealth(game);
    }
    return {
        seed,
        waveReached: last?.wave ?? 0,
        defeated: game.stopped,
        simSeconds: game.seconds,
        waves,
        raiders: [...raiders.values()],
        playerHealth: game.api.getShip(PLAYER_SHIP_ID)?.state.healthRatio ?? 0,
    };
}

// ---- aggregation ----

export interface SweepCell {
    readonly label: string;
    readonly tuning: WaveDefenceTuning;
    readonly runs: RunResult[];
}

function median(values: number[]): number {
    if (!values.length) {
        return NaN;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const fmt = (n: number, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : '–');

function totalStationHealth(record: WaveRecord) {
    return Object.values(record.stationHealth).reduce((a, b) => a + b, 0) / STATIONS.length;
}

export function sweepToMarkdown(cells: SweepCell[], maxSimSeconds: number, hz: number): string {
    const lines: string[] = [];
    lines.push('# Wave-defence balance report');
    lines.push('');
    lines.push('Generated by `wave-defence-balance.spec.ts` (`UPDATE_WAVE_BALANCE_REPORT=1`). Do not edit by hand.');
    lines.push('');
    lines.push(`- Headless core loop (no Colyseus), ${hz} Hz, cap ${maxSimSeconds} sim-s per run.`);
    lines.push(
        '- **Player proxy is crude**: GVTS on NPC automation, attacks nearest raider within 40 km of a station, else stands ground. No engineer, no repair, no human baseline -- numbers tune against this bot, not crews.',
    );
    lines.push(
        "- `killed` = the raider's capsule was breached; otherwise `written-off` (can't-fight / out-of-play rule).",
    );
    lines.push('');
    lines.push('## Survival');
    lines.push('');
    lines.push(
        '| config | runs | defeated | wave reached (min/med/max) | sim-s to defeat (med) | GVTS health end (mean) |',
    );
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const cell of cells) {
        const reached = cell.runs.map((r) => r.waveReached);
        const defeats = cell.runs.filter((r) => r.defeated);
        lines.push(
            `| ${cell.label} | ${cell.runs.length} | ${defeats.length} | ${Math.min(...reached)} / ${fmt(median(reached), 1)} / ${Math.max(...reached)} | ${fmt(median(defeats.map((r) => r.simSeconds)))} | ${fmt(mean(cell.runs.map((r) => r.playerHealth)), 2)} |`,
        );
    }
    lines.push('');
    lines.push('## Per wave (mean over runs that reached it)');
    for (const cell of cells) {
        lines.push('');
        lines.push(`### ${cell.label}`);
        lines.push('');
        lines.push(
            '| wave | budget | hulls | runs | sim-s in wave | station HP at end (avg of 3) | killed | written-off | alive at end |',
        );
        lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
        const maxWave = Math.max(...cell.runs.map((r) => r.waveReached));
        for (let wave = 1; wave <= maxWave; wave++) {
            const records = cell.runs.flatMap((r) => r.waves.filter((w) => w.wave === wave));
            const wr = cell.runs.flatMap((r) => r.raiders.filter((x) => x.wave === wave));
            lines.push(
                `| ${wave} | ${records[0]?.budget ?? '–'} | ${fmt(mean(records.map((w) => w.hulls)), 1)} | ${records.length} | ${fmt(mean(records.map((w) => w.endedAt - w.spawnedAt)))} | ${fmt(mean(records.map(totalStationHealth)), 2)} | ${wr.filter((x) => x.fate === 'killed').length} | ${wr.filter((x) => x.fate === 'written-off').length} | ${wr.filter((x) => !x.fate).length} |`,
            );
        }
    }
    lines.push('');
    lines.push('## Raider time-to-kill by hull (all configs pooled, killed only, sim-s from spawn)');
    lines.push('');
    lines.push('| hull | killed | written-off | never gone | TTK median | TTK p90 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    const all = cells.flatMap((c) => c.runs.flatMap((r) => r.raiders));
    for (const model of [...new Set(all.map((r) => r.model))].sort()) {
        const of = all.filter((r) => r.model === model);
        const ttk = of.filter((r) => r.fate === 'killed').map((r) => (r.goneAt ?? 0) - r.spawnedAt);
        const sorted = [...ttk].sort((a, b) => a - b);
        lines.push(
            `| ${model || '(never observed)'} | ${ttk.length} | ${of.filter((r) => r.fate === 'written-off').length} | ${of.filter((r) => !r.fate).length} | ${fmt(median(ttk))} | ${fmt(sorted[Math.floor(sorted.length * 0.9)] ?? NaN)} |`,
        );
    }
    lines.push('');
    return lines.join('\n');
}
