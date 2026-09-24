import * as fs from 'node:fs';

import { AmmoType, Projectile, ShipModel, XY, ammoTypes } from '@starwards/core/internal';
import { HeadlessGame, SERVER_TICK_HZ } from '../headless-game';
import {
    T1MissileParams,
    TRAINING_DECOY_ID,
    TRAINING_PLAYER_ID,
    TRAINING_TARGET_ID,
    createTrainingT1MissileMap,
} from '../../scenarios/training';

import fc from 'fast-check';
import { tapDamage } from '../damage-tap';

/**
 * `node -r ts-node/register/transpile-only run-t1-missile.ts --seeds 64 --ammo HiExpMissile --timeout 300 --out t1m.json`
 *
 * T1-missile: the GVTS fires tubes only at a dragonfly-MK1 busy attacking a friendly decoy 10-15 km
 * away. Odd seeds start with the decoy between them. Calibration only, not a game config: every
 * other ammo type is emptied and `ammo` never runs out, so missiles-per-kill is measured past the
 * real magazine.
 */
function arg(name: string, fallback: string): string {
    const at = process.argv.indexOf(`--${name}`);
    return at >= 0 ? process.argv[at + 1] : fallback;
}

/** Salvo discipline: launch only while fewer than this many GVTS missiles are in flight. */
const MAX_MISSILES_IN_FLIGHT = 2;
/** A missile that vanishes within this distance of a hull's surface ended on that hull. */
const DETONATION_SLACK_METERS = 150;

type MissileEnd = 'target' | 'decoy' | 'other';

interface T1MissileResult {
    readonly seed: number;
    readonly params: T1MissileParams;
    readonly killed: boolean;
    readonly seconds: number;
    readonly launched: number;
    readonly ends: Record<MissileEnd, number>;
    /** Summed `Damage.amount` of GVTS-fired damage events on the decoy. */
    readonly decoyDamage: number;
    readonly decoyDestroyed: boolean;
    /** Target capsule integrity at end (0 when killed). */
    readonly targetCapsule: number;
    readonly targetHealthyPlates: number;
}

function runT1Missile(
    seed: number,
    ammo: AmmoType,
    timeoutSeconds: number,
    hz: number,
    model: ShipModel,
): T1MissileResult {
    const [sample] = fc.sample(
        fc.record({ distance: fc.integer({ min: 10_000, max: 15_000 }), bearing: fc.integer({ min: 0, max: 359 }) }),
        { seed, numRuns: 1 },
    );
    const params: T1MissileParams = { ...sample, occluded: seed % 2 === 1 };
    const game = HeadlessGame.start(createTrainingT1MissileMap(params, model), seed);
    const gvts = game.api.getShip(TRAINING_PLAYER_ID);
    const target = game.api.getShip(TRAINING_TARGET_ID);
    if (!gvts || !target) {
        throw new Error('GVTS or target missing');
    }
    for (const type of ammoTypes) {
        if (type !== ammo) {
            gvts.state.magazine.setCount(type, 0);
        }
    }
    for (const tube of gvts.state.tubes) {
        tube.projectile = ammo;
        tube.loadAmmo = true;
    }

    let decoyDamage = 0;
    tapDamage(game, (id, damage) => {
        if (id === TRAINING_DECOY_ID && damage.shipId === TRAINING_PLAYER_ID) {
            decoyDamage += damage.amount;
        }
    });
    const { spaceManager } = game;

    const inFlight = new Map<string, XY>();
    const ends: Record<MissileEnd, number> = { target: 0, decoy: 0, other: 0 };
    let launched = 0;
    let targetLast = XY.clone(target.spaceObject.position);
    const decoyObject = spaceManager.state.get(TRAINING_DECOY_ID);
    const decoyPosition = XY.clone(decoyObject?.position ?? XY.zero);
    const decoyRadius = decoyObject?.radius ?? 0;
    let killed = false;
    const dt = 1 / hz;
    const refill = gvts.state.magazine.getCount(ammo);
    while (game.seconds < timeoutSeconds) {
        // Calibration only: unlimited ammo.
        gvts.state.magazine.setCount(ammo, refill);
        const targetObject = spaceManager.state.get(TRAINING_TARGET_ID);
        if (targetObject && !targetObject.destroyed) {
            gvts.setTarget(TRAINING_TARGET_ID);
            if (inFlight.size < MAX_MISSILES_IN_FLIGHT) {
                for (const tube of gvts.state.tubes) {
                    tube.safetyLocked = false;
                }
                gvts.state.fireTubesCommand = true;
            }
        }
        game.tick(dt);

        const seen = new Set<string>();
        for (const object of spaceManager.state) {
            if (Projectile.isInstance(object) && object.shipId === TRAINING_PLAYER_ID && !object.destroyed) {
                if (!inFlight.has(object.id)) {
                    launched++;
                }
                inFlight.set(object.id, XY.clone(object.position));
                seen.add(object.id);
            }
        }
        for (const [id, last] of inFlight) {
            if (seen.has(id)) {
                continue;
            }
            inFlight.delete(id);
            if (XY.distance(last, targetLast) <= target.spaceObject.radius + DETONATION_SLACK_METERS) {
                ends.target++;
            } else if (XY.distance(last, decoyPosition) <= decoyRadius + DETONATION_SLACK_METERS) {
                ends.decoy++;
            } else {
                ends.other++;
            }
        }

        const after = spaceManager.state.get(TRAINING_TARGET_ID);
        if (!after || after.destroyed) {
            killed = target.state.capsule.broken;
            break;
        }
        targetLast = XY.clone(after.position);
    }
    const decoyAfter = spaceManager.state.get(TRAINING_DECOY_ID);
    return {
        seed,
        params,
        killed,
        seconds: game.seconds,
        launched,
        ends,
        decoyDamage,
        decoyDestroyed: !decoyAfter || decoyAfter.destroyed,
        targetCapsule: target.state.capsule.integrity,
        targetHealthyPlates: target.state.armor.numberOfHealthyPlates,
    };
}

const seeds = Number(arg('seeds', '64'));
const first = Number(arg('first', '1'));
const ammo = arg('ammo', 'HiExpMissile') as AmmoType;
const timeout = Number(arg('timeout', '300'));
const model = arg('model', 'dragonfly-MK1') as ShipModel;
const results: T1MissileResult[] = [];
for (let seed = first; seed < first + seeds; seed++) {
    results.push(runT1Missile(seed, ammo, timeout, SERVER_TICK_HZ, model));
}
fs.writeFileSync(arg('out', `t1m_${ammo}.json`), JSON.stringify(results, null, 1));
