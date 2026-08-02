import { Turret, TurretDesign, TurretDesignState } from './turret';

import { ShipState } from './ship-state';
import { defectible } from './system';
import { gameField } from '../game-field';
import { getDirectionConfigFromAngle } from './ship-direction';
import { range } from '../range';

export type ThrusterDesign = TurretDesign & {
    modelName?: string;
    isInternal: boolean;
    isElectronics: boolean;
    capacity: number;
    energyCost: number;
    afterBurnerCapacity: number;
    damage50: number;
};

export class ThrusterDesignState extends TurretDesignState implements ThrusterDesign {
    @gameField('float32') capacity = 0;
    @gameField('float32') energyCost = 0;
    @gameField('float32') afterBurnerCapacity = 0;
    @gameField('float32') damage50 = 0;
}
export class Thruster extends Turret {
    public static isInstance = (o: unknown): o is Thruster => {
        return (o as Thruster)?.type === 'Thruster';
    };

    public readonly type = 'Thruster';

    get name() {
        return `Thruster ${this.index} (${getDirectionConfigFromAngle(this.fittedBearing)})`;
    }

    @gameField(ThrusterDesignState)
    design = new ThrusterDesignState();

    /**
     * the measure of current engine activity
     */
    @range([0, 1])
    @gameField('float32')
    active = 0;
    /**
     * the measure of current afterburner activity
     */
    @range([0, 1])
    @gameField('float32')
    afterBurnerActive = 0;

    @range([0, 1])
    @defectible({ normal: 1, name: 'capacity' })
    @gameField('float32')
    availableCapacity = 1.0;

    get broken(): boolean {
        return super.broken || this.availableCapacity === 0;
    }

    getVelocityCapacity(parent: ShipState): number {
        const mvCapacity = this.design.capacity;
        const abCapacity =
            parent.afterBurner *
            this.design.afterBurnerCapacity *
            parent.maneuvering.effectiveness *
            parent.maneuvering.efficiency;
        return this.effectiveness * this.availableCapacity * (mvCapacity + abCapacity);
    }
}
