import { CALLOUT_QUESTION, calloutSaid } from './callout';
import { Capabilities, Display, stationControls } from './controls';
import { ORDERS_PANEL, orderFromCallout } from '../crew/orders';
import { REFERENCE_KNOB_DEFAULTS, referenceKnobs, setReferenceKnobs } from './reference-knobs';

import { BrainRequest } from './request';
import { Policy } from './brain';
import { brainSpecSchema } from './spec';
import captain from '../brains/captain.v1.json';
import { idleTestPolicy } from './order-executors.fixtures';
import { referenceSeat } from '../reference-crew';
import { testBoard } from '../crew/orders.fixtures';
import { withOrderBoard } from './order-executors';

type XY = { x: number; y: number };
const contact = (name: string, p: XY, faction: number, radius: number) => ({
    id: name,
    name,
    type: 'Spaceship',
    scanLevel: 'BASIC',
    faction,
    radius,
    position: p,
    distance: Math.hypot(p.x, p.y),
    bearing: (Math.atan2(p.y, p.x) * 180) / Math.PI,
});

/** A station 30 km east of the GVTS (at the origin, facing east) and a raider of `radius` 5 km from it. */
const dradis = (radius: number, panels: Display['panels'] = {}): Display => ({
    panels,
    radar: {
        ownShip: { heading: 0, faction: 1, position: { x: 0, y: 0 } },
        contacts: [contact('dock', { x: 30_000, y: 0 }, 1, 1200), contact('raider', { x: 25_000, y: 0 }, 2, radius)],
    },
});

const request = {
    questions: { [CALLOUT_QUESTION]: { criteria: { bait: '', close_to: '', hold_here: '', silence: '' } } },
} as unknown as BrainRequest;
const baitCallout = { say: 'bait {name} from {distance} km at bearing {bearing}', fill: 'baitOrder', when: '' };
const seat = () =>
    referenceSeat(brainSpecSchema.parse({ ...captain, callouts: { ...captain.callouts, bait: baitCallout } }));

async function say(shown: Display) {
    const s = seat();
    const { answers } = await s.policy.answer(request, [], shown, []);
    const answer = answers[CALLOUT_QUESTION];
    return {
        choice: answer.choice,
        said: calloutSaid(s.spec, answer.choice, shown, CALLOUT_QUESTION, undefined, answer.values),
    };
}

describe('bait knobs', () => {
    afterEach(() => setReferenceKnobs());

    it('default to off, so the guard crew plays as before', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.BAIT_MODE).toBe(0);
        expect(referenceKnobs.BAIT_MODE).toBe(0);
        // a brain that knows the bait callout still says what it said without it
        const plain = referenceSeat(brainSpecSchema.parse(captain));
        const plainRequest = {
            questions: { [CALLOUT_QUESTION]: { criteria: { close_to: '', hold_here: '', silence: '' } } },
        } as unknown as BrainRequest;
        for (const radius of [10, 25]) {
            const shown = dradis(radius);
            const { answers } = await plain.policy.answer(plainRequest, [], shown, []);
            expect((await say(shown)).choice).toBe(answers[CALLOUT_QUESTION].choice);
        }
    });

    it('with BAIT_MODE on, orders a swarm raider near a station baited', async () => {
        setReferenceKnobs({ BAIT_MODE: 1 });
        const { choice, said } = await say(dradis(10));
        expect(choice).toBe('bait');
        const order = orderFromCallout(choice, said?.values, { x: 0, y: 0 });
        expect(order?.kind).toBe('bait');
        expect(order?.params?.target?.name).toBe('raider');
        expect(order?.params?.range).toBe(2000);
    });

    it('leaves a heavy hull, a low armor share and the time before the wave gate to the usual orders', async () => {
        setReferenceKnobs({ BAIT_MODE: 1 });
        expect((await say(dradis(25))).choice).not.toBe('bait');
        const wounded = dradis(10, { 'armor-status': { numberOfPlates: 10, healthyPlates: 4 } });
        expect((await say(wounded)).choice).not.toBe('bait');
        setReferenceKnobs({ BAIT_MODE: 1, BAIT_AFTER_SECONDS: 600 });
        expect((await say(dradis(10))).choice).not.toBe('bait');
    });
});

const helmsCapabilities: Capabilities = {
    commands: ['rotation', 'strafe', 'boost', 'antiDrift', 'rotationMode', 'maneuveringMode', 'afterBurner'].map(
        (command) => ({ command }),
    ),
};

/** Helms at the origin facing east, a raider at `at`, a station 3 km east, `secondsAgo` after the bait order. */
function helms(at: XY, secondsAgo: number): Display {
    const shown = testBoard().give([
        { kind: 'bait', params: { target: { name: 'raider', position: at }, range: 2000 } },
    ]).shown;
    const orders = { ...shown, orders: shown.orders.map((o) => ({ ...o, secondsAgo })) };
    return {
        panels: {
            'helms-stats': {
                rotationMode: 1,
                maneuveringMode: 1,
                maneuveringCommand: { x: 0, y: 0 },
                antiDrift: 0,
                afterBurner: 0,
            },
            [ORDERS_PANEL]: orders,
        },
        radar: {
            ownShip: { heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: [contact('dock', { x: 3_000, y: 0 }, 1, 1200), contact('raider', at, 2, 10)],
        },
    };
}

async function choices(policy: Policy, shown: Display) {
    const controls = stationControls({ display: shown, capabilities: helmsCapabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

describe('helms under a bait order', () => {
    afterEach(() => setReferenceKnobs());

    it('closes on the raider, holds range while it pulls, then kites away from the station', async () => {
        const policy = withOrderBoard(idleTestPolicy, 'helms');
        // far: closes (the raider lies east)
        expect((await choices(policy, helms({ x: 12_000, y: 0 }, 0))).boost).toBe('forward');
        // at range: holds the range for the pull seconds
        expect((await choices(policy, helms({ x: 2_000, y: 0 }, 1))).boost).toBe('hold');
        // after the pull: the kite point lies 10 km west of the station, so the ship backs off
        const kite = await choices(policy, helms({ x: 2_000, y: 0 }, 1 + referenceKnobs.BAIT_PULL_SECONDS));
        expect(kite.boost).toBe('back');
    });

    it('plays its own policy once the armor falls below the abort share', async () => {
        const policy = withOrderBoard(idleTestPolicy, 'helms');
        const shown = helms({ x: 12_000, y: 0 }, 0);
        shown.panels['armor-status'] = { numberOfPlates: 10, healthyPlates: 2 };
        expect((await choices(policy, shown)).boost).toBe('hold');
    });
});
