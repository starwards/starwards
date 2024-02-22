import { DesignState, SystemState, defectible } from './system';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type ReactorDesign = {
    energyPerSecond: number;
    maxEnergy: number;
    energyHeatEPMThreshold: number;
    energyHeat: number;
    damage50: number;
};

export class ReactorDesignState extends DesignState implements ReactorDesign {
    @gameField('float32') energyPerSecond = 0;
    @gameField('float32') maxEnergy = 0;
    @gameField('float32') energyHeatEPMThreshold = 0;
    @gameField('float32') energyHeat = 0;
    @gameField('float32') damage50 = 0;
}

export class Reactor extends SystemState {
    public static isInstance = (o: unknown): o is Reactor => {
        return (o as Reactor)?.type === 'Reactor';
    };

    public readonly type = 'Reactor';
    public readonly name = 'Reactor';

    @gameField(ReactorDesignState)
    design = new ReactorDesignState();

    @gameField('number')
    @range((t: Reactor) => [0, t.design.maxEnergy])
    @tweakable('number')
    energy = 1000;

    @gameField('float32')
    @range([0, 1])
    @defectible({ normal: 1, name: 'effeciency' })
    effeciencyFactor = 1;

    get energyPerSecond(): number {
        return this.effeciencyFactor * this.design.energyPerSecond;
    }

    get broken() {
        return this.effeciencyFactor === 0;
    }
}
