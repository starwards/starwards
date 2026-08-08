import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';

/**
 * Purely optical: obstructs field of view via `isCorporal` like any other body, and is always drawn
 * on every radar (a visible hazard, not a hidden one) — but it is never a scan-job or weapons
 * target, and never enters a faction's tracked-contact set (`isRadarContact = false`). No collision
 * effects, no warp-jam contribution; see the SpaceManager and MovementManager exclusions for
 * `Nebula.isInstance`.
 */
export class Nebula extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Nebula => {
        return !!o && (o as SpaceObjectBase).type === 'Nebula';
    };

    @gameField('string')
    public readonly type = 'Nebula';

    public readonly isRadarContact = false;

    init(id: string, position: Vec2, radius: number): this {
        this.id = id;
        this.position = position;
        this.radius = radius;
        return this;
    }
}
