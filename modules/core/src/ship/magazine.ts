import { DesignState, SystemState, defectible } from './system';

import { gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

// Properties with underline ( _ ) are templated after Projectile types, and are accessed in a generic way.

export type MagazineDesign = {
    damage50: number;
    max_CannonShell: number;
    max_BlastCannonShell: number;
    max_Missile: number;
    capacityBrokenThreshold: number;
    capacityDamageFactor: number;
};

export class MagazineDesignState extends DesignState implements MagazineDesign {
    @gameField('float32') damage50 = 0;
    @gameField('uint16') max_CannonShell = 0;
    @gameField('uint16') max_BlastCannonShell = 0;
    @gameField('uint16') max_Missile = 0;
    @gameField('float32') capacityBrokenThreshold = 0;
    @gameField('float32') capacityDamageFactor = 0;
}

export class Magazine extends SystemState {
    public static isInstance = (o: unknown): o is Magazine => {
        return (o as Magazine)?.type === 'Magazine';
    };

    public readonly type = 'Magazine';
    public readonly name = 'Magazine';

    @gameField(MagazineDesignState)
    design = new MagazineDesignState();

    @gameField('uint16')
    @range((t: Magazine) => [0, t.max_CannonShell])
    @tweakable('number')
    count_CannonShell = 0;

    @gameField('uint16')
    @range((t: Magazine) => [0, t.max_BlastCannonShell])
    @tweakable('number')
    count_BlastCannonShell = 0;

    @gameField('uint16')
    @range((t: Magazine) => [0, t.max_Missile])
    @tweakable('number')
    count_Missile = 0;

    @gameField('float32')
    @defectible({ normal: 1, name: 'capacity' })
    @range([0, 1])
    capacity = 1;

    get broken() {
        return this.capacity < this.design.capacityBrokenThreshold;
    }

    @range((t: Magazine) => [0, t.design.max_CannonShell])
    get max_CannonShell() {
        return Math.round(this.design.max_CannonShell * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_BlastCannonShell])
    get max_BlastCannonShell() {
        return Math.round(this.design.max_BlastCannonShell * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_Missile])
    get max_Missile() {
        return Math.round(this.design.max_Missile * this.capacity);
    }
}
