import { Display } from './controls';
import { buttonBrain } from './brain';
import { referenceSeatPlan } from '../reference-crew';

/**
 * The dradis picture of a captain whose own ship faces 90° at the origin, with an ally and an enemy
 * `enemyDistance` out on bearing 45°.
 */
function dradis(enemyDistance?: number): Display {
    const ally = { id: 'picket', name: 'picket', type: 'Spaceship', faction: 1, distance: 30_000, bearing: 40 };
    const enemy = { id: 'raider', name: 'raider', type: 'Spaceship', faction: 2, bearing: 45 };
    return {
        panels: {},
        radar: {
            ownShip: { id: 'GVTS', heading: 90, faction: 1, position: { x: 0, y: 0 } },
            contacts:
                enemyDistance === undefined
                    ? [ally]
                    : [ally, { ...enemy, distance: enemyDistance, position: onBearing45(enemyDistance) }],
        },
    };
}

function onBearing45(distance: number) {
    return { x: distance * Math.SQRT1_2, y: distance * Math.SQRT1_2 };
}

/** The captain's order after it saw each picture in turn, one decision apart. */
async function order(...shown: Display[]) {
    const plan = referenceSeatPlan('captain');
    const brain = buttonBrain(plan.spec, plan.policy);
    let said;
    for (const picture of shown) {
        const { callouts, decisions } = await brain.decide(picture, { commands: [] });
        expect(decisions.filter((d) => d.press)).toEqual([]);
        said = callouts[0];
    }
    return said;
}

/** Two pictures of an enemy moving `perDecision` metres along the line of sight (positive: closing). */
function moving(from: number, perDecision: number) {
    const seconds = referenceSeatPlan('captain').spec.decisionSeconds;
    return [dradis(from), dradis(from - perDecision * seconds)];
}

describe('reference captain', () => {
    it('orders the ship to close inside the still-target envelope of an enemy beyond it, on its bearing', async () => {
        const said = await order(dradis(52_340));
        expect(said?.callout).toBe('close_to');
        expect(said?.values).toEqual({ name: 'raider', range: '43', distance: '52.3', bearing: '045' });
    });

    it('orders weapons to engage a still enemy inside its 45 km envelope', async () => {
        expect(await order(dradis(30_000))).toMatchObject({ callout: 'engage', values: { name: 'raider' } });
    });

    it('once it has ordered the engage, orders the ship in to gun range while the missiles fly', async () => {
        const said = await order(dradis(30_000), dradis(30_000));
        expect(said).toMatchObject({ callout: 'close_to', values: { range: '2', distance: '30.0' } });
    });

    it('orders weapons to engage an enemy closing at cruise speed from 60 km', async () => {
        expect(await order(...moving(60_000, 600))).toMatchObject({ callout: 'engage' });
    });

    it('orders the ship close to an enemy opening at cruise speed beyond the 4 km no-escape range', async () => {
        const said = await order(...moving(10_000, -600));
        expect(said).toMatchObject({ callout: 'close_to', values: { range: '2' } });
    });

    it('orders the ship back out from an enemy too close to arm a missile', async () => {
        expect(await order(dradis(500))).toMatchObject({ callout: 'close_to' });
    });

    it('orders the ship to hold with no enemy in sight', async () => {
        expect((await order(dradis()))?.callout).toBe('hold_here');
    });
});
