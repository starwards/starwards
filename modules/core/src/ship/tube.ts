import { ChainGun } from './chain-gun';
import { ShipDirection } from './ship-direction';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';
// export type TubeDesign = ChaingunDesign & {};
// export class TubeDesignState extends ChaingunDesignState implements TubeDesign {}
export class Tube extends ChainGun {
    public static isInstance = (o: unknown): o is Tube => {
        return (o as Tube)?.type === 'Tube';
    };

    public readonly type = 'Tube';
    get name() {
        return `Tube ${this.index} (${ShipDirection[this.angle]})`;
    }

    /**
     * the index of tube in the parent ship
     */
    @type('int8')
    index = 0;

    @tweakable('number')
    angle = 0;
}
