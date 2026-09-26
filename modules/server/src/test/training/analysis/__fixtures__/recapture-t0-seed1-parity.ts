import * as fs from 'node:fs';
import { TRAINING_PLAYER_ID, TRAINING_TARGET_ID } from '../../../../scenarios/training';
import { HeadlessGame } from '../../../headless-game';
import { XY } from '@starwards/core/internal';
import fc from 'fast-check';
import { trainingScenarios } from '../../training-scenarios';

/**
 * Recaptures `t0-seed1-parity.json`: the pre-analysis inline metrics loop (as of commit `2fd730e6`),
 * run on the current physics -- the independent reference `extract.spec.ts` checks `extract.ts`
 * against. Run after a physics change that moves T0 seed 1:
 * `node -r ts-node/register/transpile-only recapture-t0-seed1-parity.ts t0-seed1-parity.json`
 */
const scenario = trainingScenarios.T0;
const seed = 1;
const timeoutSeconds = 60;
const hz = 60;
const [params] = fc.sample(scenario.params, { seed, numRuns: 1 });
const game = HeadlessGame.start(scenario.createMap(params), seed);
const gvts = game.api.getShip(TRAINING_PLAYER_ID)!;
const shells = () =>
    gvts.state.magazine.count_HiExpShell + gvts.state.magazine.count_ArmPenShell + gvts.state.magazine.count_FragShell;
const startShells = shells();
const targetStart = XY.clone(game.api.getObject(TRAINING_TARGET_ID)!.position);
const dt = 1 / hz;
let armorStrippedAt: number | null = null;
let secondsFiring = 0;
let targetHealth = 1;
let targetDrift = 0;
let killed = false;
let distanceSum = 0;
let distanceTicks = 0;
while (game.seconds < timeoutSeconds) {
    game.tick(dt);
    const target = game.api.getObject(TRAINING_TARGET_ID);
    if (!target || target.destroyed) {
        killed = true;
        targetHealth = 0;
        break;
    }
    const targetShip = game.api.getShip(TRAINING_TARGET_ID);
    if (targetShip) {
        targetHealth = targetShip.state.healthRatio;
        if (armorStrippedAt === null && targetShip.state.armor.armorPlates.every((p) => p.healthRatio <= 0)) {
            armorStrippedAt = game.seconds;
        }
    }
    if (gvts.state.chainGuns.some((g) => g.isFiring)) {
        secondsFiring += dt;
    }
    distanceSum += XY.distance(target.position, game.api.getObject(TRAINING_PLAYER_ID)!.position);
    distanceTicks++;
    targetDrift = XY.distance(target.position, targetStart);
}
const fixture = {
    scenario: 'T0',
    seed,
    killed,
    seconds: game.seconds,
    armorStrippedAt,
    targetHealth,
    shellsFired: startShells - shells(),
    secondsFiring,
    meanDistance: distanceSum / distanceTicks,
    targetDrift,
    gvtsSpeed: XY.lengthOf(game.api.getObject(TRAINING_PLAYER_ID)!.velocity),
};
fs.writeFileSync(process.argv[2], JSON.stringify(fixture, null, 2) + '\n');
