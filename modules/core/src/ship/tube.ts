import { ChainGun } from './chain-gun';
import { type } from '@colyseus/schema';
// export type TubeDesign = ChaingunDesign & {};
// export class TubeDesignState extends ChaingunDesignState implements TubeDesign {}
export class Tube extends ChainGun {
    /**
     * the index of tube in the parent ship
     */
    @type('int8')
    index = 0;
}
