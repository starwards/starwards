import { SpaceObjectBase } from './space-object-base';
import { Vec2 } from './vec2';
import { gameField } from '../game-field';
import { tweakable } from '../tweakable';

/**
 * A field of debris/charged particles (M4.29 ruling). Always drawn on every radar, never a scan-job
 * or weapons target (see `isSensorInvisible`), and — unlike a nebula — non-corporal, so it never
 * blocks line of sight. SpaceManager applies its effects to whatever overlaps it:
 * - projectiles lose `projectileAttritionRate` extra seconds of lifetime per second inside, and are
 *   destroyed without detonating once worn out;
 * - ships take hull damage of `hullDamagePerSpeed * max(0, speed - safeSpeed)` per second, on the
 *   plates facing their direction of travel.
 */
export class HazardCloud extends SpaceObjectBase {
    public static isInstance = (o: unknown): o is HazardCloud => {
        return !!o && (o as SpaceObjectBase).type === 'HazardCloud';
    };

    @gameField('string')
    public readonly type = 'HazardCloud';

    public readonly isCorporal = false;
    public freeze = true;
    public expendable = false;

    /** extra projectile lifetime (seconds) burned per second spent inside the cloud */
    @tweakable({ type: 'number', number: { min: 0 } })
    @gameField('float32')
    public projectileAttritionRate = 10;

    /** hull damage per second, per m/s of speed above `safeSpeed` */
    @tweakable({ type: 'number', number: { min: 0 } })
    @gameField('float32')
    public hullDamagePerSpeed = 0.05;

    /** speed (m/s) at or below which a ship crosses the cloud unharmed */
    @tweakable({ type: 'number', number: { min: 0 } })
    @gameField('float32')
    public safeSpeed = 20;

    init(id: string, position: Vec2, radius: number): this {
        this.id = id;
        this.position = position;
        this.radius = radius;
        return this;
    }
}
