import {
    HELMS_WEIGHTS,
    HelmsComponents,
    HelmsHostile,
    HelmsObservation,
    HELMS_SHAPE,
    TERMS,
    chosenTarget,
    helmsComponents,
    helmsScore30,
    helmsScoreOf,
    hostileRounds,
    observeHelms,
    positionTerm,
    situationTerms,
} from './helms-kpi';
import {
    AmmoType,
    Faction,
    IdleStrategy,
    RecordingEventLine,
    Spaceship,
    Vec2,
    ammoDesigns,
} from '@starwards/core/internal';

import { HeadlessGame } from '@starwards/server/src/test/headless-game';

const hostile = (over: Partial<HelmsHostile> = {}): HelmsHostile => ({
    id: 'enemy',
    x: 2000,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 11,
    gunRange: 4500,
    armed: true,
    integrity: 1,
    ...over,
});

/** The ship at the origin, nose on +x (angle 0), against `hostiles`. */
const frame = (over: Partial<HelmsObservation> = {}, hostiles: HelmsHostile[] = [hostile()]): HelmsObservation => ({
    t: 0,
    own: { x: 0, y: 0, vx: 0, vy: 0, radius: 11, angle: 0, integrity: 1, gunRange: 8000, canFire: true },
    hostiles,
    lockedId: null,
    obstacles: [],
    docking: false,
    waypoint: null,
    warpLevel: 0,
    ...over,
});

const s = (o: HelmsObservation) => positionTerm(o).term.s;

describe('helms score: position', () => {
    it('is full in the gun band with the nose on the target, and falls short of or beyond it', () => {
        expect(s(frame())).toBe(1);
        expect(s(frame({}, [hostile({ x: 250 })]))).toBeCloseTo(0.5, 6);
        expect(s(frame({}, [hostile({ x: HELMS_SHAPE.bandHigh + 3000 })]))).toBeCloseTo(Math.exp(-1), 6);
    });

    it('falls as the nose line passes wide of the target', () => {
        expect(s(frame({}, [hostile({ x: 2000, y: 100 })]))).toBe(1);
        const wide = s(frame({}, [hostile({ x: 2000, y: 600 })]));
        expect(wide).toBeLessThan(0.5);
        expect(s(frame({}, [hostile({ x: -2000 })]))).toBeLessThan(wide);
    });

    it('moves the far edge of the band out for a standoff only against an armed target that outguns us or is winning', () => {
        const at = (h: Partial<HelmsHostile>, own: Partial<HelmsObservation['own']> = {}) => {
            const o = frame({}, [hostile({ x: 4000, ...h })]);
            return positionTerm({ ...o, own: { ...o.own, ...own } });
        };
        // a fighter outgunned by our 8 km gun, and us unhurt: no standoff
        expect(at({}).justified).toBe(false);
        expect(at({}).term.s).toBeCloseTo(Math.exp(-1000 / 3000), 6);
        // it outranges us
        expect(at({ gunRange: 9000 })).toMatchObject({ justified: true, term: { s: 1 } });
        // we are losing
        expect(at({ integrity: 0.9 }, { integrity: 0.5 }).justified).toBe(true);
        // not armed: no standoff is justified
        expect(at({ gunRange: 9000, armed: false }, { integrity: 0.1 }).justified).toBe(false);
        // the edge is STANDOFF_HIGH, not further
        const far = positionTerm(frame({}, [hostile({ x: HELMS_SHAPE.standoffHigh + 3000, gunRange: 9000 })]));
        expect(far.term.s).toBeCloseTo(Math.exp(-1), 6);
    });

    it('is placed against the weapons-locked hostile, else the nearest', () => {
        const near = hostile({ id: 'near', x: 1000 });
        const locked = hostile({ id: 'locked', x: 2500, y: 2500 });
        expect(chosenTarget(frame({}, [near, locked]))?.id).toBe('near');
        expect(chosenTarget(frame({ lockedId: 'locked' }, [near, locked]))?.id).toBe('locked');
        expect(chosenTarget(frame({ lockedId: 'gone' }, [near, locked]))?.id).toBe('near');
        expect(s(frame({ lockedId: 'locked' }, [near, locked]))).toBeLessThan(s(frame({}, [near, locked])));
    });

    it('has no demand while the weapons cannot fire or nothing is hostile', () => {
        const o = frame();
        expect(positionTerm({ ...o, own: { ...o.own, canFire: false } }).term.d).toBe(0);
        expect(positionTerm(frame({}, [])).term.d).toBe(0);
    });
});

describe('helms score: evasion', () => {
    const base = (t: number) => frame({ t });
    const shot = (t: number, over: Record<string, unknown> = {}): RecordingEventLine =>
        ({
            t,
            kind: 'shot',
            objectId: `shell${t}`,
            // fired from 2 km at +x towards the ship at the origin, 500 m/s, fuse 4 s
            data: { shipId: 'enemy', ammo: 'HiExpShell', x: 2000, y: 0, vx: -500, vy: 0, ttl: 4, ...over },
        }) as RecordingEventLine;
    const hit = (t: number): RecordingEventLine => ({ t, kind: 'blast_hit', objectId: 'GVTS', data: {} }) as never;
    const frames = Array.from({ length: 40 }, (_, t) => base(t));

    it('counts a round that would have hit as dodged when nothing hits, and as a hit when something does', () => {
        const rounds = hostileRounds(frames, [shot(1)], 'GVTS');
        expect(rounds).toHaveLength(1);
        expect(rounds[0]).toMatchObject({ onCourse: true, hit: false });
        expect(hostileRounds(frames, [shot(1), hit(4)], 'GVTS')[0].hit).toBe(true);
    });

    it('ignores a round that was never on course, and counts a hit no round explains as a hit', () => {
        expect(hostileRounds(frames, [shot(1, { y: 3000 })], 'GVTS')[0].onCourse).toBe(false);
        const rounds = hostileRounds(frames, [shot(1, { y: 3000 }), hit(30)], 'GVTS');
        expect(rounds.filter((r) => r.onCourse && r.hit)).toHaveLength(1);
    });

    it('scores the share dodged, with demand that grows with the fire and none without it', () => {
        const cs = helmsComponents(frames, [shot(1), shot(2), shot(3), shot(4), hit(5)], 'GVTS');
        const at = cs[10].terms.evasion;
        expect(at.s).toBeCloseTo(0.75, 6);
        expect(at.d).toBeCloseTo(4 / 34, 6);
        expect(cs[0].terms.evasion.d).toBe(0);
        // the window forgets rounds older than 20 s
        expect(cs[39].terms.evasion.d).toBe(0);
    });
});

describe('helms score: collision, waypoint, warp', () => {
    it('asks for no collision avoidance while nothing is on course, and scores a collision in the window 0', () => {
        expect(situationTerms(frame({}, [hostile({ x: 9000 })]), false).collision.d).toBe(0);
        const ahead = (vx: number, vy = 0) =>
            frame({ own: { ...frame().own, vx, vy }, obstacles: [{ x: 6000, y: 0, vx: 0, vy: 0, radius: 50 }] }, []);
        // 6 km at 300 m/s is 20 s: just on course; beside it, or too slow, is not
        expect(situationTerms(ahead(300), false).collision.d).toBe(1);
        expect(situationTerms(ahead(100), false).collision.d).toBe(0);
        expect(situationTerms(ahead(300, 300), false).collision.d).toBe(0);
        const near = frame(
            { obstacles: [{ x: 600, y: 0, vx: 0, vy: 0, radius: 50 }], own: { ...frame().own, vx: 100 } },
            [],
        );
        expect(situationTerms(near, false).collision).toEqual({ d: 1, s: 1 });
        expect(situationTerms(near, true).collision).toEqual({ d: 1, s: 0 });
    });

    it('does not score collisions while docking', () => {
        const near = frame({ obstacles: [{ x: 600, y: 0, vx: 0, vy: 0, radius: 50 }], docking: true }, []);
        expect(situationTerms(near, true).collision.d).toBe(0);
    });

    it('reads a collision from the damage events of the next 10 s', () => {
        const events: RecordingEventLine[] = [
            { t: 5, kind: 'damage', objectId: 'GVTS', data: { damageType: 'Collision', delivery: 'impact' } } as never,
        ];
        const obs = Array.from({ length: 30 }, (_, t) =>
            frame({ t, obstacles: [{ x: 600, y: 0, vx: 0, vy: 0, radius: 50 }] }, []),
        );
        const cs = helmsComponents(obs, events, 'GVTS');
        expect(cs[0].terms.collision).toEqual({ d: 1, s: 0 });
        expect(cs[4].terms.collision.s).toBe(0);
        // after the window nothing is on course: no demand
        expect(cs[5].terms.collision.d).toBe(0);
    });

    it('scores a waypoint by how fast the ship closes on it, only while not engaged', () => {
        const wp = { x: 10000, y: 0 };
        const at = (vx: number, hostiles: HelmsHostile[] = []) =>
            situationTerms(frame({ waypoint: wp, own: { ...frame().own, vx } }, hostiles), false).waypoint;
        expect(at(0)).toEqual({ d: 1, s: 0 });
        expect(at(150).s).toBeCloseTo(0.5, 6);
        expect(at(450).s).toBe(1);
        expect(at(0, [hostile({ x: 4000 })]).d).toBe(0);
        const arrived = frame({ waypoint: { x: 100, y: 0 } }, []);
        expect(situationTerms(arrived, false).waypoint.s).toBe(1);
    });

    it('scores the warp level held only while engaged: no demand without warp or with nothing near', () => {
        expect(situationTerms(frame({ warpLevel: 0 }), false).warp.d).toBe(0);
        expect(situationTerms(frame({ warpLevel: 2 }, [hostile({ x: 4000 })]), false).warp).toEqual({ d: 1, s: 0 });
        expect(situationTerms(frame({ warpLevel: 2 }, [hostile({ x: 40000 })]), false).warp.d).toBe(0);
    });
});

describe('helms score: composition', () => {
    const terms = (over: Partial<HelmsComponents['terms']>): HelmsComponents => ({
        t: 0,
        standoffJustified: false,
        distance: null,
        integrity: 1,
        onCourse: 0,
        hits: 0,
        terms: { ...Object.fromEntries(TERMS.map((t) => [t, { d: 0, s: 0 }])), ...over } as HelmsComponents['terms'],
    });

    it('is the demand-weighted mean of the terms, and a term with no demand does not move it', () => {
        const one = terms({ position: { d: 1, s: 0.8 } });
        expect(helmsScoreOf(one)).toBeCloseTo(0.8, 9);
        expect(helmsScoreOf(terms({ position: { d: 1, s: 0.8 }, collision: { d: 0, s: 0 } }))).toBeCloseTo(0.8, 9);
        expect(helmsScoreOf(terms({ position: { d: 1, s: 1 }, collision: { d: 0.5, s: 0 } }))).toBeCloseTo(2 / 3, 9);
    });

    it('has no score where nothing is demanded: not 0, not 1', () => {
        expect(helmsScoreOf(terms({}))).toBeNull();
    });

    it('takes the weights as given', () => {
        const mixed = terms({ position: { d: 1, s: 1 }, collision: { d: 1, s: 0 } });
        expect(helmsScoreOf(mixed, { ...HELMS_WEIGHTS, collision: 3 })).toBeCloseTo(0.25, 9);
    });

    it('labels the demand-weighted mean over the next 30 s, censored when the run ends first or nothing was asked', () => {
        const mk = (t: number, d: number, sc: number): HelmsComponents => ({ ...terms({ position: { d, s: sc } }), t });
        const cs = Array.from({ length: 40 }, (_, t) => mk(t, t < 20 ? 1 : 0, t < 10 ? 1 : 0));
        const labels = helmsScore30(cs);
        // (t, t+30] holds frames 1..30: demanded in 1..19, scored 1 in 1..9
        expect(labels[0]).toBeCloseTo(9 / 19, 9);
        expect(labels[15]).toBeNull();
        expect(helmsScore30(cs.map((c) => mk(c.t, 0, 0)))[0]).toBeNull();
    });
});

describe('helms score from a game', () => {
    function game(setUp: (g: HeadlessGame) => void = () => undefined) {
        const g = HeadlessGame.start(
            {
                name: 'helms_kpi_spec',
                init: (api) => {
                    api.addPlayerSpaceship(new Spaceship().init('GVTS', new Vec2(0, 0), 'gravitas', Faction.Gravitas));
                    const target = new Spaceship().init('target', new Vec2(2000, 0), 'dragonfly-MK1', Faction.Raiders);
                    api.addNpcSpaceship(target).state.idleStrategy = IdleStrategy.PLAY_DEAD;
                },
            },
            1,
            { crewedPlayer: true },
        );
        setUp(g);
        g.tick(0.1);
        return g;
    }

    it('sees the hostile, its range and arms, and the ship that can fire', () => {
        const o = observeHelms(0, game().saveGame(), 'GVTS')!;
        expect(o.hostiles).toHaveLength(1);
        expect(o.hostiles[0]).toMatchObject({ id: 'target', gunRange: 4500, armed: true });
        expect(o.own.gunRange).toBe(8000);
        expect(o.own.canFire).toBe(true);
        expect(o.warpLevel).toBe(0);
    });

    it('stops demanding offence once the ship has nothing to fire', () => {
        const o = observeHelms(
            0,
            game((g) => {
                for (const a of Object.keys(ammoDesigns))
                    g.shipManagers.get('GVTS')!.state.magazine.setCount(a as AmmoType, 0);
            }).saveGame(),
            'GVTS',
        )!;
        expect(o.own.canFire).toBe(false);
        expect(positionTerm(o).term.d).toBe(0);
    });
});
