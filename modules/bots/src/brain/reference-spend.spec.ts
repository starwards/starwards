import { Capabilities, Display, stationControls } from './controls';
import { REFERENCE_KNOB_DEFAULTS, setReferenceKnobs } from './reference-knobs';

import { BrainRequest } from './request';
import { ORDERS_PANEL } from '../crew/orders';
import { Policy } from './brain';
import { makeReferencePolicy } from './reference-policy';
import { testBoard } from '../crew/orders.fixtures';

const capabilities: Capabilities = {
    commands: [{ command: 'fireChainGun', count: 1 }, { command: 'nextTarget' }, { command: 'clearTarget' }],
};

const ship = (id: string, x: number, y: number, faction = 2, radius = 20) => ({
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

/** The GVTS at the origin facing 0°, locked on `enemy` dead ahead at `range`, with `shells` HE and AP left. */
function display(opts: { range?: number; shells?: number; engage?: string; station?: { x: number; y: number } }) {
    const { range = 3000, shells = 100, engage, station } = opts;
    const shown: Display = {
        panels: {
            'targeting-status': { targetId: 'enemy', allyInLine: null, allyNearTarget: null },
            'ammo-status': {
                fitted: true,
                ammo: {
                    HiExpShell: { count: shells / 2, max: 50 },
                    ArmPenShell: { count: shells / 2, max: 50 },
                    FragShell: { count: 100, max: 100 },
                },
            },
            'systems-status': [],
            ...(engage
                ? { [ORDERS_PANEL]: testBoard().give([{ kind: 'engage', params: { target: { name: engage } } }]).shown }
                : {}),
        },
        radar: {
            ownShip: { id: 'GVTS', heading: 0, faction: 1, position: { x: 0, y: 0 } },
            contacts: [
                ship('enemy', range, 0),
                ship('other', 0, 5000),
                ...(station ? [ship('station', station.x, station.y, 1, 400)] : []),
            ],
        },
    };
    return shown;
}

async function choices(policy: Policy, shown: Display) {
    const controls = stationControls({ display: shown, capabilities, burstSeconds: 1 });
    const { answers } = await policy.answer({} as BrainRequest, controls, shown, []);
    return Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, a.choice]));
}

afterEach(() => setReferenceKnobs());

describe('reference weapons shell spending knobs', () => {
    it('defaults keep the old behaviour: fire out to 8000 m, no budget, follow the engage order', async () => {
        expect(REFERENCE_KNOB_DEFAULTS.FIRE_RANGE_METERS).toBe(8000);
        const policy = makeReferencePolicy(1);
        expect((await choices(policy, display({ range: 7900 })))['fireChainGun:0']).toBe('fire');
        expect((await choices(policy, display({ range: 7900, shells: 2 })))['fireChainGun:0']).toBe('fire');
        expect((await choices(policy, display({ engage: 'other' }))).target).toBe('next');
    });

    it('FIRE_RANGE_METERS holds fire beyond it, unless the target is within STATION_GUARD_METERS of an allied station', async () => {
        setReferenceKnobs({ FIRE_RANGE_METERS: 2000, STATION_GUARD_METERS: 1500 });
        expect((await choices(makeReferencePolicy(1), display({})))['fireChainGun:0']).toBe('hold_fire');
        expect((await choices(makeReferencePolicy(1), display({ range: 1900 })))['fireChainGun:0']).toBe('fire');
        expect((await choices(makeReferencePolicy(1), display({ station: { x: 4000, y: 0 } })))['fireChainGun:0']).toBe(
            'fire',
        );
    });

    it('a brain fire range still caps the knob', async () => {
        const policy = makeReferencePolicy(1, undefined, 'reference', undefined, undefined, 2000);
        expect((await choices(policy, display({})))['fireChainGun:0']).toBe('hold_fire');
    });

    it('WAVE_SHELL_BUDGET holds fire once that share of the first-seen HE and AP is spent, until SHELL_BUDGET_SECONDS', async () => {
        setReferenceKnobs({ WAVE_SHELL_BUDGET: 0.5, SHELL_BUDGET_SECONDS: 10 });
        const policy = makeReferencePolicy(1);
        expect((await choices(policy, display({ shells: 100 })))['fireChainGun:0']).toBe('fire');
        expect((await choices(policy, display({ shells: 60 })))['fireChainGun:0']).toBe('fire');
        expect((await choices(policy, display({ shells: 40 })))['fireChainGun:0']).toBe('hold_fire');
        expect((await choices(policy, display({ shells: 40, station: { x: 3500, y: 0 } })))['fireChainGun:0']).toBe(
            'hold_fire',
        );
        setReferenceKnobs({ WAVE_SHELL_BUDGET: 0.5, SHELL_BUDGET_SECONDS: 10, STATION_GUARD_METERS: 1000 });
        expect((await choices(policy, display({ shells: 40, station: { x: 3500, y: 0 } })))['fireChainGun:0']).toBe(
            'fire',
        );
        for (let i = 0; i < 6; i++) await choices(policy, display({ shells: 40, range: 9000 }));
        expect((await choices(policy, display({ shells: 40 })))['fireChainGun:0']).toBe('fire');
    });

    it('FINISH_LOCK_SECONDS keeps the lock against a new engage order once weapons fired that long at it', async () => {
        setReferenceKnobs({ FINISH_LOCK_SECONDS: 2 });
        const policy = makeReferencePolicy(1);
        expect((await choices(policy, display({ engage: 'other' }))).target).toBe('next');
        await choices(policy, display({}));
        expect((await choices(policy, display({ engage: 'other' }))).target).toBe('none');
        expect((await choices(policy, display({ engage: 'other', range: 9000 }))).target).toBe('next');
    });
});
