/**
 * One missile per shot from the GVTS at a held-lock dragonfly-MK1 (see `missile-range.ts`); prints
 * P(hit) and P(kill) per ammo x target motion x launch range as a markdown table.
 *
 *   npm --prefix modules/server run missile-range -- \
 *     --ammo HiExpMissile,ArmPenMissile --motion still,fleeing,approaching,crossing --ranges 10,15,20 --seeds 8
 *
 * `--ranges` in km. Single process: run one ammo or motion per process to use more cores.
 */
import { TargetMotion, missileRangeSweep } from './missile-range';
import { MissileAmmoType } from '@starwards/core/internal';

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const ammos = arg('ammo', 'HiExpMissile').split(',') as MissileAmmoType[];
const motions = arg('motion', 'still,fleeing,approaching,crossing').split(',') as TargetMotion[];
const ranges = arg('ranges', '10,15,20,25,30,35,40,45,50')
    .split(',')
    .map((km) => Number(km) * 1000);
const seeds = Array.from({ length: Number(arg('seeds', '8')) }, (_, i) => i + 1);

const rows = missileRangeSweep(ammos, motions, ranges, seeds).map(
    (cell) =>
        `| ${cell.ammo} | ${cell.motion} | ${cell.rangeMeters / 1000} | ${cell.pHit.toFixed(2)} | ${cell.pKill.toFixed(2)} |`,
);
process.stdout.write(
    [
        '| ammo | motion | range km | P(hit) | P(kill) |',
        '| ---- | ------ | -------: | -----: | ------: |',
        ...rows,
        '',
    ].join('\n'),
);
