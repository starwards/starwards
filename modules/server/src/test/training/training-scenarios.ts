import { GameMap, ShipModel } from '@starwards/core/internal';
import { T1Params, createTrainingT1Map } from '../../scenarios/training';

import fc from 'fast-check';

/** A training rung: a fast-check arbitrary for its layout, and the map built from one sample. */
interface TrainingScenario<P> {
    readonly name: string;
    readonly description: string;
    readonly params: fc.Arbitrary<P>;
    createMap(params: P): GameMap;
}

const T1_ATTACKING_DRAGONFLY: TrainingScenario<T1Params> = {
    name: 'T1',
    description: 'GVTS vs one dragonfly-MK1 attacking it, 2-8 km, any bearing',
    params: fc.record({
        distance: fc.integer({ min: 2000, max: 8000 }),
        bearing: fc.integer({ min: 0, max: 359 }),
    }),
    createMap: createTrainingT1Map,
};

/** T1 with another hull attacking the GVTS -- the TTK ladder's heavier rungs. */
const t1WithHull = (name: string, model: ShipModel): TrainingScenario<T1Params> => ({
    ...T1_ATTACKING_DRAGONFLY,
    name,
    description: `GVTS vs one ${model} attacking it, 2-8 km, any bearing`,
    createMap: (params) => createTrainingT1Map(params, model),
});

export const trainingScenarios: Record<string, TrainingScenario<never>> = {
    T1: T1_ATTACKING_DRAGONFLY as TrainingScenario<never>,
    'T1-MK2': t1WithHull('T1-MK2', 'dragonfly-MK2') as TrainingScenario<never>,
};
