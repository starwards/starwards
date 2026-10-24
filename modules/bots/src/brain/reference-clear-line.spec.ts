import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_HELMS, makeReferencePolicy } from './reference-policy';

import { BrainRequest } from './request';
import { brainSpecSchema } from './spec';
import helms from '../brains/helms.v1.json';
import { referenceSeat } from '../reference-crew';

const capabilities: Capabilities = {
    commands: ['rotation', 'strafe', 'boost', 'antiDrift', 'rotationMode'].map((command) => ({ command })),
};

const contact = (id: string, x: number, y: number, faction: number, radius: number) => ({
    id,
    name: id,
    type: 'Spaceship',
    scanLevel: 'BASIC',
    faction,
    radius,
    position: { x, y },
    distance: Math.hypot(x, y),
    bearing: (Math.atan2(y, x) * 180) / Math.PI,
});

/** The GVTS at the origin facing 0°, a still raider 3 km ahead, and an allied station `station` further on. */
function display(station: { x: number; y: number }, raiderX = 3000): Display {
    return {
        panels: {
            'helms-stats': {
                rotationMode: 1,
                maneuveringMode: 1,
                rotationCommand: 0,
                maneuveringCommand: { x: 0, y: 0 },
                antiDrift: 0,
            },
        },
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: [contact('raider', raiderX, 0, 2, 20), contact('station', station.x, station.y, 1, 1200)],
        },
    };
}

async function choices(shown: Display, clearLine: boolean) {
    const policy = makeReferencePolicy(1, undefined, 'reference', { ...REFERENCE_HELMS, clearLine });
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown, []);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

describe('reference helms clear line', () => {
    // the gun line from the parking spot behind the raider runs on through the station 5 km past it
    const fouled = display({ x: 8000, y: 0 });

    it('without it, parks straight behind the raider whatever lies beyond', async () => {
        expect(await choices(fouled, false)).toMatchObject({ boost: 'forward', strafe: 'hold' });
    });

    it('parks off the line, across the raider from the station, when a station lies in the gun line past the raider', async () => {
        expect((await choices(fouled, true)).strafe).not.toBe('hold');
    });

    it('keeps the straight parking when the station is well off the line', async () => {
        expect(await choices(display({ x: 3000, y: 8000 }), true)).toMatchObject({ boost: 'forward', strafe: 'hold' });
    });
});

describe('reference helms clear line from where the ship is', () => {
    /** Raider 3 km ahead flying away along +x at 100 m/s: helms parks behind it, on the line it is already on. */
    async function sidestep(station: { x: number; y: number }) {
        const policy = makeReferencePolicy(1, undefined, 'reference', { ...REFERENCE_HELMS, clearLine: true });
        const at = (x: number) => display(station, x);
        const first = at(3000);
        const controls = stationControls({ display: first, capabilities, burstSeconds: 1 });
        await policy.answer({} as BrainRequest, controls, first, []);
        const { answers } = await policy.answer({} as BrainRequest, controls, at(3100), []);
        return answers.strafe.choice;
    }

    it('steps toward the side of a station beyond the target, swinging the line past it off it', async () => {
        expect(await sidestep({ x: 7000, y: 600 })).toBe('right');
    });

    it('steps away from the side of a station between the ship and the target', async () => {
        expect(await sidestep({ x: 1500, y: 600 })).toBe('left');
    });
});

describe('clear line by brain version', () => {
    it('a helms brain opts in with clearLine', async () => {
        const raw = { ...helms, clearLine: true };
        const seat = referenceSeat(brainSpecSchema.parse(raw));
        const shown = display({ x: 8000, y: 0 });
        const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
        const { answers } = await seat.policy.answer({} as BrainRequest, controls, shown, []);
        expect(answers.strafe.choice).not.toBe('hold');
    });
});
