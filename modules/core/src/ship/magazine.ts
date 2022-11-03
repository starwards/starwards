import { Schema, type } from '@colyseus/schema';

import { DesignState } from './system';
import { defectible } from './system';
import { number2Digits } from '../number-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

// Properties with underline ( _ ) are templated after Projectile types, and are accessed in a generic way.

export type MagazineDesign = {
    damage50: number;
    max_CannonShell: number;
    max_BlastCannonShell: number;
    capacityBrokenThreshold: number;
    capacityDamageFactor: number;
};

export class MagazineDesignState extends DesignState implements MagazineDesign {
    @number2Digits damage50 = 0;
    @type('uint16') max_CannonShell = 0;
    @type('uint16') max_BlastCannonShell = 0;
    @number2Digits capacityBrokenThreshold = 0;
    @number2Digits capacityDamageFactor = 0;
}

export class Magazine extends Schema {
    public static isInstance = (o: unknown): o is Magazine => {
        return (o as Magazine)?.type === 'Magazine';
    };

    public readonly type = 'Magazine';
    public readonly name = 'Magazine';

    @type(MagazineDesignState)
    design = new MagazineDesignState();

    @type('uint16')
    @range((t: Magazine) => [0, t.max_CannonShell])
    @tweakable('number')
    count_CannonShell = 0;

    @type('uint16')
    @range((t: Magazine) => [0, t.max_BlastCannonShell])
    @tweakable('number')
    count_BlastCannonShell = 0;

    @number2Digits
    @defectible({ normal: 1, name: 'capacity' })
    @range([0, 1])
    capacity = 1;

    get broken() {
        return this.capacity < this.design.capacityBrokenThreshold;
    }

    @range((t: Magazine) => [0, t.design.max_CannonShell])
    get max_CannonShell() {
        return this.design.max_CannonShell * this.capacity;
    }

    @range((t: Magazine) => [0, t.design.max_BlastCannonShell])
    get max_BlastCannonShell() {
        return this.design.max_BlastCannonShell * this.capacity;
    }
}
