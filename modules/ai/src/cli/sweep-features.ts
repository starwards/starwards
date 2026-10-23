/**
 * The crew's picture at each swept fork state, as features for a close-vs-hold decision tree, joined
 * with each state's swept outcomes. Reads a `sweep` out dir (or several), writes CSV to stdout.
 *
 *   npm run sweep-features -- <sweep out dir> [<sweep out dir>...] > features.csv
 *
 * Features come from what the seats' displays showed at the fork, never ground truth.
 */
import { readRunLog, requestAt } from '../branching/run-log';
import fs from 'node:fs';
import path from 'node:path';

type XY = { x: number; y: number };
type Contact = {
    name?: string;
    distance: number;
    position?: XY;
    faction?: number;
    type?: string;
    radius?: number;
    scanLevel?: string;
};
type Radar = { ownShip?: { faction?: number; position?: XY }; contacts?: Contact[] };
type Row = { seed: number; t: number; alternative: string; pass: boolean; firstStationLostAt: number | null };

const STATION_RADIUS = 200;
const BODY_RADIUS = 2000;
/** Any enemy distance is capped here; with no enemy on the dradis it is the value, flagged by `hasEnemy` = 0. */
export const NO_ENEMY = 20_000;
const cap = (d: number) => (Number.isFinite(d) ? Math.min(d, NO_ENEMY) : NO_ENEMY);
const dist = (a?: XY, b?: XY) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN);

/** Identified enemy ships (nearest first), allied stations and unidentified ship-sized contacts on a dradis. */
function picture(radar: Radar | undefined) {
    const faction = radar?.ownShip?.faction;
    const contacts = radar?.contacts ?? [];
    const ships = contacts.filter((c) => c.type === 'Spaceship' && c.faction !== undefined);
    return {
        enemies: ships.filter((c) => c.faction !== faction).sort((a, b) => a.distance - b.distance),
        stations: ships.filter((c) => c.faction === faction && (c.radius ?? 0) >= STATION_RADIUS),
        unknowns: contacts.filter((c) => c.type === undefined && (c.radius ?? 0) < BODY_RADIUS),
    };
}

/** The features of the crew's picture at `t`. */
export function features(log: ReturnType<typeof readRunLog>, t: number) {
    const captain = requestAt(log, 'captain', t)?.display as { radar?: Radar } | undefined;
    const helms = requestAt(log, 'helms', t)?.display;
    const weapons = requestAt(log, 'weapons', t)?.display;
    const radar = captain?.radar;
    const { enemies, stations, unknowns } = picture(radar);
    const nearest = enemies[0];
    const toStation = (e: Contact) => Math.min(...stations.map((s) => dist(e.position, s.position)));
    const own = radar?.ownShip?.position;
    const armor = helms?.panels['armor-status'] as { numberOfPlates?: number; healthyPlates?: number } | undefined;
    const ammo = (weapons?.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)?.ammo;
    // trends over the last minute, from the captain's dradis at each of its decisions
    const window = log.requests.filter((r) => r.station === 'captain' && r.t > t - 60 && r.t <= t + 1e-9);
    const pictureOf = (r: (typeof window)[number] | undefined) =>
        picture((r?.display as { radar?: Radar } | undefined)?.radar);
    const attacked = window.filter((r) => {
        const p = pictureOf(r);
        return p.enemies.some((e) => p.stations.some((s) => dist(e.position, s.position) <= NO_ENEMY));
    }).length;
    const engineer = requestAt(log, 'engineer', t)?.display;
    const eng = engineer?.panels['engineering-status'] as { energy?: number; maxEnergy?: number } | undefined;
    const perStation = Object.fromEntries(
        [...stations]
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
            .map((s) => [`enemyTo:${s.name}`, cap(Math.min(...enemies.map((e) => dist(e.position, s.position))))]),
    );
    return {
        t,
        attackShare60: window.length ? attacked / window.length : 0,
        enemyTrend60: pictureOf(window[window.length - 1]).enemies.length - pictureOf(window[0]).enemies.length,
        energy: eng?.maxEnergy ? (eng.energy ?? 0) / eng.maxEnergy : 1,
        hasEnemy: enemies.length ? 1 : 0,
        enemies: enemies.length,
        unknowns: unknowns.length,
        nearestEnemy: cap(nearest?.distance ?? NaN),
        enemyToStation: nearest && stations.length ? cap(toStation(nearest)) : NO_ENEMY,
        closestThreatToStation: enemies.length && stations.length ? cap(Math.min(...enemies.map(toStation))) : NO_ENEMY,
        ownToStation: stations.length ? Math.min(...stations.map((s) => dist(own, s.position))) : NO_ENEMY,
        stations: stations.length,
        ...perStation,
        armor: armor?.numberOfPlates ? (armor.healthyPlates ?? 0) / armor.numberOfPlates : 1,
        heMissiles: ammo?.HiExpMissile?.count ?? 0,
        heShells: ammo?.HiExpShell?.count ?? 0,
    } as Record<string, number>;
}

/** CSV of records, one column per key any record has, in first-seen order; a missing value is empty. */
export function toCsv(records: Record<string, string | number>[]) {
    const cols = [...new Set(records.flatMap((r) => Object.keys(r)))];
    return [cols, ...records.map((r) => cols.map((c) => r[c] ?? ''))].map((l) => l.join(',')).join('\n') + '\n';
}

function main() {
    const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const records: Record<string, string | number>[] = [];
    // an action's column is its kind, so `dock_for_repair@<station>` pools across stations
    const kindOf = (alt: string) => alt.split('@')[0];
    for (const dir of dirs) {
        const defaults = new Map(
            (JSON.parse(fs.readFileSync(path.join(dir, 'defaults.json'), 'utf8')) as Row[]).map((d) => [d.seed, d]),
        );
        const states = new Map<number, Map<number, Row[]>>();
        for (const l of fs.readFileSync(path.join(dir, 'sweep.jsonl'), 'utf8').split('\n').filter(Boolean)) {
            const r = JSON.parse(l) as Row;
            const bySeed = states.get(r.seed) ?? states.set(r.seed, new Map()).get(r.seed)!;
            bySeed.set(r.t, [...(bySeed.get(r.t) ?? []), r]);
        }
        for (const [seed, byT] of states) {
            const runDir = path.join(dir, 'runs', `seed${seed}`);
            const rec = fs.readdirSync(runDir, { recursive: true, encoding: 'utf8' }).find((f) => f.endsWith('.sgr'));
            if (!rec) continue;
            const log = readRunLog(path.join(runDir, rec));
            for (const [t, list] of byT) {
                const f = features(log, t);
                const rates: Record<string, string> = {};
                for (const kind of new Set(list.map((r) => kindOf(r.alternative)))) {
                    const rs = list.filter((r) => kindOf(r.alternative) === kind);
                    rates[`pass:${kind}`] = `${rs.filter((r) => r.pass).length}/${rs.length}`;
                }
                records.push({
                    sweep: path.basename(dir),
                    seed,
                    ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
                    defaultPass: defaults.get(seed)?.pass ? 1 : 0,
                    ...rates,
                });
            }
        }
    }
    process.stdout.write(toCsv(records));
}

if (require.main === module) main();
