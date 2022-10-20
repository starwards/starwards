import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { number2Digits } from '../number-field';
import { range } from '../range';

export type MagazineDesign = {
    damage50: number;
    maxCannonShells: number;
};
export class MagazineDesignState extends DesignState implements MagazineDesign {
    @number2Digits damage50 = 0;
    @type('uint16') maxCannonShells = 0;
}

export class Magazine extends Schema {
    public static isInstance = (o: unknown): o is Magazine => {
        return (o as Magazine)?.type === 'Magazine';
    };

    public readonly type = 'Magazine';

    @type(MagazineDesignState)
    design = new MagazineDesignState();

    @type('uint16')
    @range((t: Magazine) => [0, t.design.maxCannonShells])
    cannonShells = 0;

    get broken() {
        return false;
    }
}
