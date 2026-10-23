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
    return {
        t,
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
    let header = false;
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
                const rate = (alt: string) => {
                    const rs = list.filter((r) => r.alternative === alt);
                    return rs.length ? `${rs.filter((r) => r.pass).length}/${rs.length}` : '';
                };
                if (!header) {
                    out.push(['dir', 'seed', ...Object.keys(f), 'defaultPass', 'close_to', 'hold_here'].join(','));
                    header = true;
                }
                out.push(
                    [path.basename(dir), seed, ...Object.values(f).map((v) => Math.round(v * 1000) / 1000), defaults.get(seed)?.pass ? 1 : 0, rate('close_to'), rate('hold_here')].join(','),
                );
            }
        }
    }
    process.stdout.write(out.join('\n') + '\n');
}

main();
