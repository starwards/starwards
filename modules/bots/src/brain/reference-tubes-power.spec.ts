import { Capabilities, Display, stationControls } from './controls';

import { BrainRequest } from './request';
import { makeReferencePolicy } from './reference-policy';

const capabilities: Capabilities = { commands: [{ command: 'systemPower', systems: ['/tubes/0'] }] };

/** The tube shut down; `energy` of a 1000 store; `hit` whether the ship has lost a plate. */
function display(energy: number, hit: boolean, defects: { system: string; field: string }[] = []): Display {
    return {
        panels: {
            'full-systems-status': [{ pointer: '/tubes/0', power: 0, coolantFactor: 0, heat: 0 }],
            'engineering-status': { energy, maxEnergy: 1000, energyCells: 2 },
            'repair-queue': { slots: [] },
            'damage-report': defects.map((d) => ({ ...d, value: 0.5, normal: 1 })),
            'armor-status': { numberOfPlates: 8, healthyPlates: hit ? 7 : 8 },
        },
    };
}

async function tubePower(shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 2 });
    const { answers } = await makeReferencePolicy(2).answer({} as BrainRequest, controls, shown);
    return answers['systemPower:/tubes/0'].choice;
}

describe('reference engineer tube power', () => {
    it('keeps the tubes shut out of a fight', async () => {
        expect(await tubePower(display(1000, false))).toBe('hold');
    });
    it('powers the tubes once a plate is lost and the store holds half', async () => {
        expect(await tubePower(display(800, true))).toBe('raise');
    });
    it('powers the tubes once a defect is reported', async () => {
        expect(await tubePower(display(800, false, [{ system: 'Magazine', field: 'x' }]))).toBe('raise');
    });
    it('keeps the tubes shut in a fight while the store is below half', async () => {
        expect(await tubePower(display(400, true))).toBe('hold');
    });
});
