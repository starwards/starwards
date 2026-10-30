import { CALLOUT_QUESTION, calloutSaid } from './callout';
import { calloutMemory, referenceCallout } from './reference-orders';

import { BrainRequest } from './request';
import { BrainSpec } from './spec';
import { Display } from './controls';
import { informedAmmoSide } from './plate-intel';
import { plateIntelFill } from './plate-intel';

/** A Signals display marking `target`, a 4-plate ship at the origin facing east, with the plates in `broken` down. */
function signalsDisplay(broken: number[], model = 'composite', ownAt = { x: 1000, y: 0 }): Display {
    return {
        panels: {
            'target-intel': {
                targetId: 'e1',
                intel: 'LIVE',
                design: {
                    armor: {
                        numberOfPlates: 4,
                        degreesPerPlate: 90,
                        healthyPlates: 4 - broken.length,
                        layers: [{ model }, { model: 'composite' }],
                        plates: [0, 1, 2, 3].map((index) => ({ index, broken: broken.includes(index) })),
                    },
                },
            },
        },
        radar: {
            ownShip: { id: 'me', heading: 0, position: ownAt },
            contacts: [
                {
                    id: 'e1',
                    name: 'raider',
                    scanLevel: 'FULL',
                    distance: 1000,
                    bearing: 0,
                    heading: 0,
                    position: { x: 0, y: 0 },
                },
            ],
        },
    };
}

describe('plateIntelFill (Signals)', () => {
    it('reports the plate holding on the arc facing our ship', () => {
        expect(plateIntelFill(signalsDisplay([2]))).toMatchObject({
            id: 'e1',
            facing: 'holding',
            holding: '3',
            total: '4',
            model: 'composite',
        });
    });

    it('reports the facing plate broken when the arc toward us is down', () => {
        // we sit east (local angle 0) of a ship facing east: plate 0 covers 0-90 degrees
        expect(plateIntelFill(signalsDisplay([0]))?.facing).toBe('broken');
        // the same ship seen from the west faces its plate 2
        expect(plateIntelFill(signalsDisplay([0], 'composite', { x: -1000, y: 0 }))?.facing).toBe('holding');
        expect(plateIntelFill(signalsDisplay([2], 'composite', { x: -1000, y: 0 }))?.facing).toBe('broken');
    });

    it('says nothing without internals', () => {
        const d = signalsDisplay([]);
        d.panels['target-intel'] = { targetId: 'e1', intel: 'NONE' };
        expect(plateIntelFill(d)).toBeUndefined();
    });
});

describe('informedAmmoSide', () => {
    it('plays AP while the facing plates hold and HE once they are broken', () => {
        expect(informedAmmoSide({ facing: 'holding', model: 'composite', holding: 4, total: 4 })).toBe('ap');
        expect(informedAmmoSide({ facing: 'broken', model: 'composite', holding: 3, total: 4 })).toBe('he');
        expect(informedAmmoSide({ facing: 'broken', model: 'hardened', holding: 3, total: 4 })).toBe('he');
    });

    it('plays AP against whipple whatever the plates', () => {
        expect(informedAmmoSide({ facing: 'broken', model: 'whipple', holding: 0, total: 4 })).toBe('ap');
    });

    it('model-blind, plays whipple by its plates like any other model', () => {
        expect(informedAmmoSide({ facing: 'broken', model: 'whipple', holding: 0, total: 4 }, true)).toBe('he');
        expect(informedAmmoSide({ facing: 'holding', model: 'whipple', holding: 4, total: 4 }, true)).toBe('ap');
    });

    it('with the facing plate unknown, goes by whether most plates are down', () => {
        expect(informedAmmoSide({ facing: 'unknown', model: 'composite', holding: 3, total: 4 })).toBe('ap');
        expect(informedAmmoSide({ facing: 'unknown', model: 'composite', holding: 1, total: 4 })).toBe('he');
    });
});

describe('plate_intel callout', () => {
    const spec = {
        decisionSeconds: 1,
        controls: {},
        callouts: {
            plate_intel: {
                say: 'target {name}: {holding} of {total} plates holding, facing {facing}',
                when: '',
                fill: 'plateIntel',
            },
            enemy_position: { say: 'enemy', when: '' },
        },
    } as unknown as BrainSpec;
    const request = {
        state: {},
        questions: {
            [CALLOUT_QUESTION]: {
                type: 'choice',
                instructions: '',
                criteria: { plate_intel: '', enemy_position: '', silence: '' },
            },
        },
    } as BrainRequest;
    const say = (d: Display, memory: ReturnType<typeof calloutMemory>, elapsed: number) =>
        referenceCallout(request, d, undefined, elapsed, undefined, {
            heard: [],
            state: memory,
            salvoOrdered: false,
            focusOrdered: false,
            focusStation: undefined,
            checkFireOrdered: false,
            dockOrdered: false,
        })?.choice;

    it('is said on a change and repeated after a while, never while nothing is marked', () => {
        const memory = calloutMemory();
        expect(say(signalsDisplay([]), memory, 0)).toBe('plate_intel');
        expect(say(signalsDisplay([]), memory, 3)).not.toBe('plate_intel');
        expect(say(signalsDisplay([0]), memory, 1)).toBe('plate_intel');
        expect(say(signalsDisplay([0]), memory, 16)).toBe('plate_intel');
        expect(say({ panels: {}, radar: undefined }, memory, 20)).not.toBe('plate_intel');
    });

    it('fills the phrase from the Target Details panel', () => {
        expect(calloutSaid(spec, 'plate_intel', signalsDisplay([2]))?.phrase).toBe(
            'target raider: 3 of 4 plates holding, facing holding',
        );
    });
});
