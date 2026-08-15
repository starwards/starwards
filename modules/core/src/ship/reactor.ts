import { DesignState, SystemState, defectible } from './system';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type ReactorDesign = {
    modelName?: string;
    isInternal: boolean;
    isElectronics: boolean;
    energyPerSecond: number;
    maxEnergy: number;
    energyHeatEPMThreshold: number;
    energyHeat: number;
    damage50: number;
    /** Max size of the reactor's finite jump-start reserve (issue #2137). Restocked only while docked. */
    maxEnergyCells: number;
};

export class ReactorDesignState extends DesignState implements ReactorDesign {
    @gameField('float32') energyPerSecond = 0;
    @gameField('float32') maxEnergy = 0;
    @gameField('float32') energyHeatEPMThreshold = 0;
    @gameField('float32') energyHeat = 0;
    @gameField('float32') damage50 = 0;
    @gameField('uint8') maxEnergyCells = 0;
}

export class Reactor extends SystemState {
    public static isInstance = (o: unknown): o is Reactor => {
        return (o as Reactor)?.type === 'Reactor';
    };

    public readonly type = 'Reactor';
    public readonly name = 'Reactor';

    @gameField(ReactorDesignState)
    design = new ReactorDesignState();

    @range((t: Reactor) => [0, t.design.maxEnergy])
    @tweakable('number')
    @gameField('number')
    energy = 1000;

    @range([0, 1])
    @defectible({ normal: 1, name: 'effeciency' })
    @gameField('float32')
    effeciencyFactor = 1;

    /**
     * Finite jump-start reserve (issue #2137): consumed by the `reactorJumpStart` repair protocol
     * to bootstrap a zero-energy, damaged reactor. Restocked only while docked, see
     * `ReactorCellManager`.
     */
    @range((t: Reactor) => [0, t.design.maxEnergyCells])
    @tweakable('number')
    @gameField('uint8')
    energyCells = 0;

    /**
     * Seconds for an empty reserve to refill at a docked station (`ReactorCellManager`), at
     * `design.maxEnergyCells / cellRestockSeconds` cells/sec. `@tweakable` so a GM can speed up
     * restock to rescue a live session, same as `Magazine.restockDurationSeconds`.
     */
    @range([1, 3600])
    @tweakable('number')
    @gameField('float32')
    cellRestockSeconds = 120;

    get energyPerSecond(): number {
        return this.effeciencyFactor * this.design.energyPerSecond;
    }

    get broken() {
        return this.effeciencyFactor <= 0;
    }
}
