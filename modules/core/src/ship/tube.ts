import { ChainGun } from './chain-gun';
import { gameField } from '../game-field';
import { getDirectionConfigFromAngle } from './ship-direction';
import { tweakable } from '../tweakable';

// export type TubeDesign = ChaingunDesign & {};
// export class TubeDesignState extends ChaingunDesignState implements TubeDesign {}
export class Tube extends ChainGun {
    public static isInstance = (o: unknown): o is Tube => {
        return (o as Tube)?.type === 'Tube';
    };

    public readonly type = 'Tube';
    get name() {
        return `Tube ${this.index} (${getDirectionConfigFromAngle(this.angle)})`;
    }

    /**
     * the index of tube in the parent ship
     */
    @gameField('int8')
    index = 0;

    @tweakable('number')
    angle = 0;
}
