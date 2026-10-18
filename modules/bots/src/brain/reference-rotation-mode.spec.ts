import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const VELOCITY = 1;
const TARGET = 2;

const capabilities: Capabilities = { commands: [{ command: 'rotationMode', count: 1 }] };

const enemy = {
    id: 'enemy',
    type: 'Spaceship',
    position: { x: 0, y: 0 },
    scanLevel: 'BASIC',
    bearing: 0,
    distance: 3000,
};

/** A helms-only seat sees `helms-stats` and its radar; the fused tactical seat also holds `targeting-status`. */
function display(seat: 'helms' | 'tactical', rotationMode: number, locked: boolean): Display {
    return {
        panels: {
            'helms-stats': { rotationMode, maneuveringMode: VELOCITY, targetLocked: locked },
            ...(seat === 'tactical' ? { 'targeting-status': { targetId: locked ? 'enemy' : undefined } } : {}),
            'systems-status': [],
        },
        radar: { ownShip: { heading: 0 }, contacts: [enemy] },
    };
}

async function rotationChoice(shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const result = await makeReferencePolicy(0.5).answer({} as BrainRequest, controls, shown);
    return result.answers.rotationMode?.choice;
}

describe.each(['helms', 'tactical'] as const)('reference rotation mode, %s seat', (seat) => {
    it('waits without a weapons lock, even with an enemy ship on the radar', async () => {
        expect(await rotationChoice(display(seat, VELOCITY, false))).toBe('wait');
    });

    it('presses once weapons holds a lock and rotation mode is not TARGET', async () => {
        expect(await rotationChoice(display(seat, VELOCITY, true))).toBe('press');
    });

    it('waits once rotation mode is TARGET', async () => {
        expect(await rotationChoice(display(seat, TARGET, true))).toBe('wait');
    });
});
