import {
    Faction,
    IdleStrategy,
    Projectile,
    Spaceship,
    Vec2,
    XY,
    blastRadius,
    shipConfigurations,
} from '@starwards/core/internal';

import { Benchmark } from './benchmark';
import { BlastOverlaps } from '@starwards/server/src/test/blast-overlaps';
import fc from 'fast-check';
import { offNose } from '../brain/verbal';

const SHIP = 'GVTS';
const TARGET = 'target';
/**
 * A shell launched with the target further than this to the side of the nose's line could not have
 * hit it, whatever its fuse: wasted. The high-explosive blast's own radius.
 */
const OFF_LINE_METERS = blastRadius('HiExpShell');

type Params = { distance: number; bearing: number; drift: number };

/**
 * Shooting range: one dragonfly that never thrusts nor shoots, 1.5�6 km away within 90� of the GVTS's
 * nose, some drifting sideways at up to 40 m/s. Helms is the fixed `reference` pilot: once weapons
 * holds a lock it turns the nose onto the target (rotation TARGET mode) and closes in, so the
 * nose sweeps across the target while turning and blast knock-back keeps shoving it off the line.
 * The weapons officer must lock it (it needs ~8 s of scanning first), fire whenever the gun bears,
 * and hold fire while it does not. Score, per minute of run: blast hits on the target minus shells
 * launched while the target was more than 5� off the nose (the chain gun's own spread makes most
 * shells miss even when aimed well, so only off-line shots count against it). The run ends at 60 s
 * or when the target dies.
 */
const weaponsRange: Benchmark<Params> = {
    name: 'weapons-range',
    station: 'weapons',
    description: 'lock a still or drifting dragonfly and hit it with the chain gun, not wasting shells',
    params: fc.record({
        distance: fc.integer({ min: 1500, max: 6000 }),
        bearing: fc.integer({ min: -90, max: 90 }),
        drift: fc.integer({ min: -40, max: 40 }),
    }),
    createMap: ({ distance, bearing, drift }) => ({
        name: 'bench_weapons_range',
        init: (game) => {
            game.addPlayerSpaceship(new Spaceship().init(SHIP, new Vec2(0, 0), 'gravitas', Faction.Gravitas));
            const start = XY.byLengthAndDirection(distance, bearing);
            const dragonfly = new Spaceship().init(TARGET, Vec2.make(start), 'dragonfly-MK1', Faction.Raiders);
            dragonfly.velocity = Vec2.make(XY.byLengthAndDirection(drift, bearing + 90));
            const target = game.addNpcSpaceship(dragonfly).state;
            target.idleStrategy = IdleStrategy.PLAY_DEAD;
            // as on training rung T0: blast knock-back must not fling the target faster than the GVTS flies
            target.smartPilot.design.maxSpeed = shipConfigurations.gravitas.smartPilot.maxSpeed;
            target.smartPilot.design.maxSpeedFromAfterBurner = shipConfigurations.gravitas.smartPilot.maxSpeed;
        },
    }),
    shipId: SHIP,
    timeoutSeconds: 60,
    supporting: [{ station: 'helms', policy: 'reference' }],
    scorer: () => {
        const blasts = new BlastOverlaps();
        const seenShells = new Set<string>();
        let hits = 0;
        let shells = 0;
        let offLine = 0;
        let seconds = 0;
        return {
            sample(game, dt) {
                seconds += dt;
                const target = game.spaceManager.state.get(TARGET);
                if (!target) return;
                const ship = game.spaceManager.state.get(SHIP);
                const objects = [...game.spaceManager.state];
                for (const o of objects) {
                    if (ship && Projectile.isInstance(o) && o.shipId === SHIP && !seenShells.has(o.id)) {
                        seenShells.add(o.id);
                        shells++;
                        const sight = XY.difference(target.position, ship.position);
                        const off = Math.abs(offNose(XY.angleOf(sight), ship.angle));
                        const aside = off >= 90 ? Infinity : XY.lengthOf(sight) * Math.sin((off * Math.PI) / 180);
                        if (aside > OFF_LINE_METERS) offLine++;
                    }
                }
                for (const [, onto] of blasts.next(objects, [target])) {
                    if (onto.id === TARGET) hits++;
                }
            },
            done: (game) => !game.spaceManager.state.get(TARGET) || !!game.spaceManager.state.get(TARGET)?.destroyed,
            result: () => ({
                score: seconds ? ((hits - offLine) * 60) / seconds : 0,
                hits,
                shells,
                offLine,
                accuracy: shells ? hits / shells : NaN,
            }),
        };
    },
};

export default weaponsRange;
