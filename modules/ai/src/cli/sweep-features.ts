/**
 * The crew's picture at each swept fork state, as features for a close-vs-hold decision tree, joined
 * with each state's swept outcomes. Reads a `sweep` out dir (or several), writes CSV to stdout.
 *
 *   npm run sweep-features -- <sweep out dir> [<sweep out dir>...] > features.csv
 *
 * Features come from what the seats' displays showed at the fork, never ground truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readRunLog, requestAt } from '../branching/run-log';

type XY = { x: number; y: number };
type Contact = { distance: number; position?: XY; faction?: number; type?: string; radius?: number };
type Radar = { ownShip?: { faction?: number; position?: XY }; contacts?: Contact[] };
type Row = { seed: number; t: number; alternative: string; pass: boolean; firstStationLostAt: number | null };

const STATION_RADIUS = 200;
const dist = (a?: XY, b?: XY) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN);

/** The features of the crew's picture at `t`. */
export function features(log: ReturnType<typeof readRunLog>, t: number) {
    const captain = requestAt(log, 'captain', t)?.display as { radar?: Radar } | undefined;
    const helms = requestAt(log, 'helms', t)?.display as { panels: Record<string, unknown> } | undefined;
    const weapons = requestAt(log, 'weapons', t)?.display as { panels: Record<string, unknown> } | undefined;
    const radar = captain?.radar;
    const faction = radar?.ownShip?.faction;
    const ships = (radar?.contacts ?? []).filter((c) => c.type === 'Spaceship' && c.faction !== undefined);
    const enemies = ships.filter((c) => c.faction !== faction).sort((a, b) => a.distance - b.distance);
    const stations = ships.filter((c) => c.faction === faction && (c.radius ?? 0) >= STATION_RADIUS);
    const nearest = enemies[0];
    const toStation = (e: Contact) => Math.min(...stations.map((s) => dist(e.position, s.position)));
    const own = radar?.ownShip?.position;
    const armor = helms?.panels['armor-status'] as { numberOfPlates?: number; healthyPlates?: number } | undefined;
    const ammo = (weapons?.panels['ammo-status'] as { ammo?: Record<string, { count?: number }> } | undefined)?.ammo;
    // trends over the last minute, from the captain's dradis at each of its decisions
    const window = log.requests.filter((r) => r.station === 'captain' && r.t > t - 60 && r.t <= t + 1e-9);
    const attacked = window.filter((r) => {
        const rr = (r.display as { radar?: Radar }).radar;
        const f = rr?.ownShip?.faction;
        const cs = (rr?.contacts ?? []).filter((c) => c.type === 'Spaceship' && c.faction !== undefined);
        const st = cs.filter((c) => c.faction === f && (c.radius ?? 0) >= STATION_RADIUS);
        return cs.some((e) => e.faction !== f && st.some((s) => dist(e.position, s.position) <= 20_000));
    }).length;
    const enemiesAt = (r: (typeof window)[number] | undefined) => {
        const rr = (r?.display as { radar?: Radar } | undefined)?.radar;
        return (rr?.contacts ?? []).filter(
            (c) => c.type === 'Spaceship' && c.faction !== undefined && c.faction !== rr?.ownShip?.faction,
        ).length;
    };
    const engineer = requestAt(log, 'engineer', t)?.display as { panels: Record<string, unknown> } | undefined;
    const eng = engineer?.panels['engineering-status'] as
        { energy?: number; maxEnergy?: number; hullDamaged?: number } | undefined;
    return {
        t,
        attackShare60: window.length ? attacked / window.length : 0,
        enemyTrend60: enemiesAt(window[window.length - 1]) - enemiesAt(window[0]),
        energy: eng?.maxEnergy ? (eng.energy ?? 0) / eng.maxEnergy : 1,
        hullDamaged: Number(eng?.hullDamaged ?? 0),
        enemies: enemies.length,
        nearestEnemy: nearest?.distance ?? 1e6,
        enemyToStation: nearest && stations.length ? toStation(nearest) : 1e6,
        closestThreatToStation: enemies.length && stations.length ? Math.min(...enemies.map(toStation)) : 1e6,
        ownToStation: stations.length ? Math.min(...stations.map((s) => dist(own, s.position))) : 1e6,
        stations: stations.length,
        armor: armor?.numberOfPlates ? (armor.healthyPlates ?? 0) / armor.numberOfPlates : 1,
        heMissiles: ammo?.HiExpMissile?.count ?? 0,
        heShells: ammo?.HiExpShell?.count ?? 0,
    };
}

function main() {
    const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const out: string[] = [];
    const recs: { cols: (string | number)[]; feats: string[]; rates: Map<string, string> }[] = [];
    const kinds = new Set<string>();
    // an action's column is its kind, so `dock_for_repair@<station>` pools across stations
    const kindOf = (alt: string) => alt.split('@')[0];
    for (const dir of dirs) {
        const defaults = new Map(
            (JSON.parse(fs.readFileSync(path.join(dir, 'defaults.json'), 'utf8')) as Row[]).map((d) => [d.seed, d]),
        );
        const rows = fs
            .readFileSync(path.join(dir, 'sweep.jsonl'), 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as Row);
        const states = new Map<string, Row[]>();
        for (const r of rows) states.set(`${r.seed}@${r.t}`, [...(states.get(`${r.seed}@${r.t}`) ?? []), r]);
        const bySeed = new Map<number, string[]>();
        for (const key of states.keys()) {
            const seed = Number(key.split('@')[0]);
            bySeed.set(seed, [...(bySeed.get(seed) ?? []), key]);
        }
        for (const [seed, keys] of bySeed) {
            const runDir = path.join(dir, 'runs', `seed${seed}`);
            const rec = fs.readdirSync(runDir, { recursive: true, encoding: 'utf8' }).find((f) => f.endsWith('.sgr'));
            if (!rec) continue;
            const log = readRunLog(path.join(runDir, rec));
            for (const key of keys) {
                const t = Number(key.split('@')[1]);
                const f = features(log, t);
                const list = states.get(key)!;
                const rates = new Map<string, string>();
                for (const kind of new Set(list.map((r) => kindOf(r.alternative)))) {
                    kinds.add(kind);
                    const rs = list.filter((r) => kindOf(r.alternative) === kind);
                    rates.set(kind, `${rs.filter((r) => r.pass).length}/${rs.length}`);
                }
                recs.push({
                    cols: [
                        path.basename(dir),
                        seed,
                        ...Object.values(f).map((v) => Math.round(v * 1000) / 1000),
                        defaults.get(seed)?.pass ? 1 : 0,
                    ],
                    feats: Object.keys(f),
                    rates,
                });
            }
        }
    }
    process.stdout.write(out.join('\n') + '\n');
}

main();
