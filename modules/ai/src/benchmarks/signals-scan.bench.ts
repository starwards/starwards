import { Faction, IdleStrategy, ScanLevel, ShipState, Spaceship, Vec2, XY } from '@starwards/core/internal';

import { Benchmark } from './benchmark';
import fc from 'fast-check';

const SHIP = 'GVTS';

type Contact = { distance: number; bearing: number };
type Params = { heading: number; near: Contact[]; far: Contact[] };

/** Scan tiers a ship contact can reach: UFO → BASIC → FULL. */
const TIERS_PER_CONTACT = 2;

/**
 * Scan sweep: unarmed dragonflies that never move lie around the GVTS — three within the omni radar's
 * ~49 km reach, two beyond it at 55–68 km within 90° of the nose, which only the scan beam narrowed
 * to its 5° minimum (reaching ~70 km) and pointed at them can see. Nothing outside the field of view
 * is shown or scanned, so the far ones must be found by sweeping. The scan queue starts PAUSED, as a
 * previous watch left it. Scanning works one contact at a time (5 s per tier at NORMAL power: the scan base
 * duration is halved here so the near contacts take ~30 s and the run turns on the far ones), and
 * a job's progress is lost when its contact leaves the field of view. Score: the time-mean share of
 * the scan tiers reached (BASIC and FULL per contact), so faster scanning scores higher; an idle
 * officer scores 0.
 */
const signalsScan: Benchmark<Params> = {
    name: 'signals-scan',
    station: 'signals',
    description: 'unpause the scan queue and scan every contact, sweeping the beam for those beyond the omni radar',
    params: fc.record({
        heading: fc.integer({ min: 0, max: 359 }),
        // bearings spread at least 40° apart so no contact hides another
        near: fc
            .tuple(
                fc.integer({ min: 0, max: 359 }),
                fc.array(fc.integer({ min: 8_000, max: 45_000 }), {
                    minLength: 3,
                    maxLength: 3,
                }),
            )
            .map(([b, ds]) => ds.map((distance, i) => ({ distance, bearing: b + i * 120 }))),
        far: fc
            .tuple(
                fc.integer({ min: -90, max: 30 }),
                fc.integer({ min: 40, max: 60 }),
                fc.array(fc.integer({ min: 55_000, max: 68_000 }), {
                    minLength: 2,
                    maxLength: 2,
                }),
            )
            .map(([first, gap, ds]) => ds.map((distance, i) => ({ distance, bearing: first + i * gap }))),
    }),
    createMap: ({ heading, near, far }) => ({
        name: 'bench_signals_scan',
        init: (game) => {
            const ship = new Spaceship().init(SHIP, new Vec2(0, 0), 'gravitas', Faction.Gravitas);
            ship.angle = heading;
            const own: ShipState = game.addPlayerSpaceship(ship).state;
            own.signals.jobsPaused = true;
            // half the GVTS's 5 s, so the near contacts are done in ~30 s and the run turns on the far ones
            own.signals.design.scanBaseDuration = 2.5;
            [...near, ...far.map((c) => ({ ...c, bearing: c.bearing + heading }))].forEach((c, i) => {
                const contact = new Spaceship().init(
                    `contact${i}`,
                    Vec2.make(XY.byLengthAndDirection(c.distance, c.bearing)),
                    'dragonfly-MK1',
                    Faction.Raiders,
                );
                const npc = game.addNpcSpaceship(contact).state;
                npc.idleStrategy = IdleStrategy.PLAY_DEAD;
                npc.magazine.count_HiExpShell = 0;
                npc.magazine.count_ArmPenShell = 0;
                npc.magazine.count_FragShell = 0;
            });
        },
    }),
    shipId: SHIP,
    timeoutSeconds: 90,
    supporting: [],
    scorer: () => {
        let seconds = 0;
        let share = 0;
        let tiers = 0;
        let farTiers = 0;
        let all = 0;
        return {
            sample(game, dt) {
                const ids = [...game.spaceManager.state]
                    .filter((o) => o.id.startsWith('contact'))
                    .map((o) => o.id)
                    .sort();
                const levels = ids.map((id) => game.spaceManager.factionIntel.getScanLevel(id, Faction.Gravitas));
                const tier = (l: ScanLevel) => (l >= ScanLevel.FULL ? 2 : l >= ScanLevel.BASIC ? 1 : 0);
                all = ids.length * TIERS_PER_CONTACT;
                tiers = levels.reduce((a, l) => a + tier(l), 0);
                farTiers = levels.slice(3).reduce((a, l) => a + tier(l), 0);
                seconds += dt;
                share += (tiers / Math.max(1, all)) * dt;
            },
            done: () => all > 0 && tiers === all,
            result: () => ({ score: seconds ? share / seconds : 0, tiers, farTiers }),
        };
    },
};

export default signalsScan;
