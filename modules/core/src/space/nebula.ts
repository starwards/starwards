import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';

/**
 * Purely optical: obstructs field of view via `isCorporal` like any other body, but never appears
 * as a contact/blip/scan-job — `isRadarInvisible` hides it from every radar consumer while it still
 * casts a shadow. No collision effects, no warp-jam contribution; see the SpaceManager and
 * MovementManager exclusions for `Nebula.isInstance`.
 */
export class Nebula extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is Nebula => {
        return !!o && (o as SpaceObjectBase).type === 'Nebula';
    };

    @gameField('string')
    public readonly type = 'Nebula';

    public readonly isRadarInvisible = true;

    init(id: string, position: Vec2, radius: number): this {
        this.id = id;
        this.position = position;
        this.radius = radius;
        return this;
    }
}
