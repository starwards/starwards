import { DesignState, SystemState, defectible } from './system';

import { commandable, gameField } from '../game-field';
import { range } from '../range';
import { tweakable } from '../tweakable';

// Magazine fields are templated after the 8 AmmoType keys defined in
// logic/damage-matrix (CannonHe, CannonAp, CannonFrag, MissileHe, MissileSabot,
// MissileCluster, MissileTandem, MissileEmp). chain-gun-manager / damage-manager
// access them generically via `count_${ammoType}` / `max_${ammoType}`.

export type MagazineDesign = {
    modelName?: string;
    damage50: number;
    max_CannonHe: number;
    max_CannonAp: number;
    max_CannonFrag: number;
    max_MissileHe: number;
    max_MissileSabot: number;
    max_MissileCluster: number;
    max_MissileTandem: number;
    max_MissileEmp: number;
    capacityBrokenThreshold: number;
    capacityDamageFactor: number;
};

export class MagazineDesignState extends DesignState implements MagazineDesign {
    @gameField('float32') damage50 = 0;
    @gameField('uint16') max_CannonHe = 0;
    @gameField('uint16') max_CannonAp = 0;
    @gameField('uint16') max_CannonFrag = 0;
    @gameField('uint16') max_MissileHe = 0;
    @gameField('uint16') max_MissileSabot = 0;
    @gameField('uint16') max_MissileCluster = 0;
    @gameField('uint16') max_MissileTandem = 0;
    @gameField('uint16') max_MissileEmp = 0;
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

    @range((t: Magazine) => [0, t.max_CannonHe])
    @tweakable('number')
    @gameField('uint16')
    count_CannonHe = 0;

    @range((t: Magazine) => [0, t.max_CannonAp])
    @tweakable('number')
    @gameField('uint16')
    count_CannonAp = 0;

    @range((t: Magazine) => [0, t.max_CannonFrag])
    @tweakable('number')
    @gameField('uint16')
    count_CannonFrag = 0;

    @range((t: Magazine) => [0, t.max_MissileHe])
    @tweakable('number')
    @gameField('uint16')
    count_MissileHe = 0;

    @range((t: Magazine) => [0, t.max_MissileSabot])
    @tweakable('number')
    @gameField('uint16')
    count_MissileSabot = 0;

    @range((t: Magazine) => [0, t.max_MissileCluster])
    @tweakable('number')
    @gameField('uint16')
    count_MissileCluster = 0;

    @range((t: Magazine) => [0, t.max_MissileTandem])
    @tweakable('number')
    @gameField('uint16')
    count_MissileTandem = 0;

    @range((t: Magazine) => [0, t.max_MissileEmp])
    @tweakable('number')
    @gameField('uint16')
    count_MissileEmp = 0;

    @commandable()
    @defectible({ normal: 1, name: 'capacity' })
    @range([0, 1])
    @gameField('float32')
    capacity = 1;

    get broken() {
        return this.capacity < this.design.capacityBrokenThreshold;
    }

    @range((t: Magazine) => [0, t.design.max_CannonHe])
    get max_CannonHe() {
        return Math.round(this.design.max_CannonHe * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_CannonAp])
    get max_CannonAp() {
        return Math.round(this.design.max_CannonAp * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_CannonFrag])
    get max_CannonFrag() {
        return Math.round(this.design.max_CannonFrag * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_MissileHe])
    get max_MissileHe() {
        return Math.round(this.design.max_MissileHe * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_MissileSabot])
    get max_MissileSabot() {
        return Math.round(this.design.max_MissileSabot * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_MissileCluster])
    get max_MissileCluster() {
        return Math.round(this.design.max_MissileCluster * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_MissileTandem])
    get max_MissileTandem() {
        return Math.round(this.design.max_MissileTandem * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_MissileEmp])
    get max_MissileEmp() {
        return Math.round(this.design.max_MissileEmp * this.capacity);
    }
}
