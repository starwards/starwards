import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { defectible } from '../defectible';
import { number2Digits } from '../number-field';
import { range } from '../range';

export type MagazineDesign = {
    damage50: number;
    maxCannonShells: number;
    capacityBrokenThreshold: number;
    capacityDamageFactor: number;
};

export class MagazineDesignState extends DesignState implements MagazineDesign {
    @number2Digits damage50 = 0;
    @type('uint16') maxCannonShells = 0;
    @number2Digits capacityBrokenThreshold = 0;
    @number2Digits capacityDamageFactor = 0;
}

export class Magazine extends Schema {
    public static isInstance = (o: unknown): o is Magazine => {
        return (o as Magazine)?.type === 'Magazine';
    };

    public readonly type = 'Magazine';

    @type(MagazineDesignState)
    design = new MagazineDesignState();

    @type('uint16')
    @range((t: Magazine) => [0, t.maxCannonShells])
    cannonShells = 0;

    @number2Digits
    @defectible({ normal: 1, name: 'capacity suboptimal' })
    capacity = 1;

    get broken() {
        return this.capacity < this.design.capacityBrokenThreshold;
    }

    @range((t: Magazine) => [0, t.design.maxCannonShells])
    get maxCannonShells() {
        return this.design.maxCannonShells * this.capacity;
    }
}
