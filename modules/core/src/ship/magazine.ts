import { DesignState, SystemState, defectible } from './system';
import { commandable, gameField } from '../game-field';

import { ProjectileModel } from '../space/projectile';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type MagazineDesign = {
    modelName?: string;
    damage50: number;
    max_HiExpShell: number;
    max_ArmPenShell: number;
    max_FragShell: number;
    max_HiExpMissile: number;
    max_ArmPenMissile: number;
    max_FragMissile: number;
    max_ClusterMissile: number;
    max_TandemMissile: number;
    max_ElecMissile: number;
    capacityBrokenThreshold: number;
    capacityDamageFactor: number;
};

export class MagazineDesignState extends DesignState implements MagazineDesign {
    @gameField('float32') damage50 = 0;
    @gameField('uint16') max_HiExpShell = 0;
    @gameField('uint16') max_ArmPenShell = 0;
    @gameField('uint16') max_FragShell = 0;
    @gameField('uint16') max_HiExpMissile = 0;
    @gameField('uint16') max_ArmPenMissile = 0;
    @gameField('uint16') max_FragMissile = 0;
    @gameField('uint16') max_ClusterMissile = 0;
    @gameField('uint16') max_TandemMissile = 0;
    @gameField('uint16') max_ElecMissile = 0;
    @gameField('float32') capacityBrokenThreshold = 0;
    @gameField('float32') capacityDamageFactor = 0;
}

export class Magazine extends SystemState {
    public static isInstance = (o: unknown): o is Magazine => {
        return (o as Magazine)?.type === 'Magazine';
    };

    public readonly type = 'Magazine';
    override readonly isInternal = true;
    override readonly isElectronics = true;
    public readonly name = 'Magazine';

    @gameField(MagazineDesignState)
    design = new MagazineDesignState();

    @range((t: Magazine) => [0, t.max_HiExpShell])
    @tweakable('number')
    @gameField('uint16')
    count_HiExpShell = 0;

    @range((t: Magazine) => [0, t.max_ArmPenShell])
    @tweakable('number')
    @gameField('uint16')
    count_ArmPenShell = 0;

    @range((t: Magazine) => [0, t.max_FragShell])
    @tweakable('number')
    @gameField('uint16')
    count_FragShell = 0;

    @range((t: Magazine) => [0, t.max_HiExpMissile])
    @tweakable('number')
    @gameField('uint16')
    count_HiExpMissile = 0;

    @range((t: Magazine) => [0, t.max_ArmPenMissile])
    @tweakable('number')
    @gameField('uint16')
    count_ArmPenMissile = 0;

    @range((t: Magazine) => [0, t.max_FragMissile])
    @tweakable('number')
    @gameField('uint16')
    count_FragMissile = 0;

    @range((t: Magazine) => [0, t.max_ClusterMissile])
    @tweakable('number')
    @gameField('uint16')
    count_ClusterMissile = 0;

    @range((t: Magazine) => [0, t.max_TandemMissile])
    @tweakable('number')
    @gameField('uint16')
    count_TandemMissile = 0;

    @range((t: Magazine) => [0, t.max_ElecMissile])
    @tweakable('number')
    @gameField('uint16')
    count_ElecMissile = 0;

    @commandable()
    @defectible({ normal: 1, name: 'capacity' })
    @range([0, 1])
    @gameField('float32')
    capacity = 1;

    get broken() {
        return this.capacity < this.design.capacityBrokenThreshold;
    }

    getCount(m: ProjectileModel): number {
        return this[`count_${m}`];
    }

    setCount(m: ProjectileModel, value: number): void {
        this[`count_${m}`] = value;
    }

    getMax(m: ProjectileModel): number {
        return this[`max_${m}`];
    }

    @range((t: Magazine) => [0, t.design.max_HiExpShell])
    get max_HiExpShell() {
        return Math.round(this.design.max_HiExpShell * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_ArmPenShell])
    get max_ArmPenShell() {
        return Math.round(this.design.max_ArmPenShell * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_FragShell])
    get max_FragShell() {
        return Math.round(this.design.max_FragShell * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_HiExpMissile])
    get max_HiExpMissile() {
        return Math.round(this.design.max_HiExpMissile * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_ArmPenMissile])
    get max_ArmPenMissile() {
        return Math.round(this.design.max_ArmPenMissile * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_FragMissile])
    get max_FragMissile() {
        return Math.round(this.design.max_FragMissile * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_ClusterMissile])
    get max_ClusterMissile() {
        return Math.round(this.design.max_ClusterMissile * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_TandemMissile])
    get max_TandemMissile() {
        return Math.round(this.design.max_TandemMissile * this.capacity);
    }

    @range((t: Magazine) => [0, t.design.max_ElecMissile])
    get max_ElecMissile() {
        return Math.round(this.design.max_ElecMissile * this.capacity);
    }
}
