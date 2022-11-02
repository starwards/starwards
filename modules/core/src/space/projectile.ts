import { Explosion } from './explosion';
import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { number2Digits } from '../number-field';
import { tweakable } from '../tweakable';
import { type } from '@colyseus/schema';
// currently projectiles config is hard-coded. should move to a more dynamic solution in the future.
export enum ProjectileModel {
    None = -1,
    CannonShell,
}
export const ProjectileModels: ProjectileModel[] = Object.keys(ProjectileModel).filter(Number.isInteger).map(Number);
export type ProjectileDesign = typeof cannonShell;
export const cannonShell = {
    name: 'cannon shell',
    radius: 1,
    explosion: {
        secondsToLive: 1,
        expansionSpeed: 100,
        damageFactor: 20,
        blastFactor: 1,
    },
};

export const projectileDesigns = {
    [ProjectileModel.CannonShell]: cannonShell,
};
export type ProjectileDesigns = typeof projectileDesigns;

export class Projectile extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Projectile => {
        return !!o && (o as SpaceObjectBase).type === 'Projectile';
    };

    @number2Digits
    @tweakable({ type: 'number', number: { min: 0.01 } })
    public secondsToLive = 0;

    public readonly type = 'Projectile';
    @type('uint16')
    public health = 10;
    public _explosion?: Explosion;

    constructor(model?: ProjectileModel) {
        super();
        const design = projectileDesigns[model as 0];
        if (design) {
            this._explosion = new Explosion();
            this._explosion.assign(design.explosion);
            this.radius = design.radius;
        }
    }

    init(id: string, position: Vec2): this {
        this.id = id;
        this.position = position;
        return this;
    }
}
