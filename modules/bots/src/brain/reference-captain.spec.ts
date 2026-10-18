import { CLOSE_RANGE_METERS, MISSILE_LAUNCH_BAND_METERS } from './engagement';

import { Display } from './controls';
import { buttonBrain } from './brain';
import { referenceSeatPlan } from '../reference-crew';

/** The dradis picture of a captain whose own ship faces 90°, with an enemy and an ally at the given ranges. */
function dradis(enemyDistance?: number): Display {
    const ally = { id: 'picket', name: 'picket', type: 'Spaceship', faction: 1, distance: 30_000, bearing: 40 };
    const enemy = { id: 'raider', name: 'raider', type: 'Spaceship', faction: 2, bearing: 45 };
    return {
        panels: {},
        radar: {
            ownShip: { id: 'GVTS', heading: 90, faction: 1, position: { x: 0, y: 0 } },
            contacts: enemyDistance === undefined ? [ally] : [ally, { ...enemy, distance: enemyDistance }],
        },
    };
}

async function order(shown: Display) {
    const plan = referenceSeatPlan('captain');
    const { callouts, decisions } = await buttonBrain(plan.spec, plan.policy).decide(shown, { commands: [] });
    expect(decisions.filter((d) => d.press)).toEqual([]);
    return callouts[0];
}

describe('reference captain', () => {
    it('orders the ship to close to missile range of an enemy beyond it, on the enemy bearing', async () => {
        const said = await order(dradis(52_340));
        expect(said?.callout).toBe('close_to');
        expect(said?.values).toEqual({
            name: 'raider',
            range: String(CLOSE_RANGE_METERS / 1000),
            distance: '52.3',
            bearing: '045',
        });
    });

    it('orders weapons to engage an enemy inside missile range', async () => {
        const said = await order(dradis((MISSILE_LAUNCH_BAND_METERS.min + MISSILE_LAUNCH_BAND_METERS.max) / 2));
        expect(said).toMatchObject({ callout: 'engage', values: { name: 'raider' } });
    });

    it('orders the ship to hold with no enemy in sight', async () => {
        expect((await order(dradis()))?.callout).toBe('hold_here');
    });
});
