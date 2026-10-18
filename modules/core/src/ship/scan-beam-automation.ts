import { Faction, Spaceship } from '../space';
import { Radar } from './radar';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
import { XY } from '../logic/xy';
import { sectorCovers } from '../logic/field-of-view';
import { toDegreesDelta } from '../logic/formulas';

/**
 * How far ahead of its current bearing a full-circle beam is commanded each tick. Any lead under 180 keeps
 * `updateTurret`'s shortest-path swing turning the same way; the mount's `turnSpeed` sets the actual pace.
 */
const SWEEP_LEAD_DEGREES = 90;

/**
 * Drives the scan beams of a ship nobody crews (M4.31): each beam sweeps until a hostile ship is inside it,
 * then follows that ship, keeping it covered, until it leaves the beam, drops out of sight or dies, and
 * then sweeps again. Bearing commands only — the beam's own `turnSpeed` and `bearingLimit` still govern it.
 */
export class ScanBeamAutomation {
    /** Per beam: the hostile it is following. */
    private readonly locked = new Map<Radar, string>();
    /** Per limited-traverse beam: the sweep direction, +1 or -1. */
    private readonly sweepDirection = new Map<Radar, number>();

    constructor(
        private readonly state: ShipState,
        private readonly spaceManager: SpaceManager,
    ) {}

    update() {
        for (const radar of this.state.radars) {
            if (!radar.design.isScanBeam || radar.design.turnSpeed <= 0) {
                continue;
            }
            const target = this.followed(radar) ?? this.acquire(radar);
            if (target) {
                this.locked.set(radar, target.id);
                const hullBearing = XY.angleOf(XY.difference(target.position, this.state.position)) - this.state.angle;
                radar.bearingCommand = radar.bearingCommandFor(hullBearing);
            } else {
                this.locked.delete(radar);
                this.sweep(radar);
            }
        }
    }

    /** The hostile this beam already follows, while the beam still covers it. */
    private followed(radar: Radar): Spaceship | null {
        const id = this.locked.get(radar);
        const target = id ? this.spaceManager.state.get(id) : undefined;
        return target && Spaceship.isInstance(target) && this.inBeam(radar, target) ? target : null;
    }

    /** The nearest hostile ship inside the beam, if any. */
    private acquire(radar: Radar): Spaceship | null {
        let nearest: Spaceship | null = null;
        let nearestDistance = Infinity;
        for (const candidate of this.spaceManager.state.getAll('Spaceship')) {
            if (
                candidate.faction === Faction.NONE ||
                candidate.faction === this.state.faction ||
                !this.inBeam(radar, candidate)
            ) {
                continue;
            }
            const distance = XY.distance(candidate.position, this.state.position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = candidate;
            }
        }
        return nearest;
    }

    /** Live, in this ship's field of view (so not occluded), and inside this beam's sector. */
    private inBeam(radar: Radar, target: Spaceship): boolean {
        if (target.destroyed || !this.spaceManager.isVisible(this.state.id, target.id)) {
            return false;
        }
        const diff = XY.difference(target.position, this.state.position);
        return sectorCovers(
            { direction: radar.getGlobalBearing(this.state), arc: radar.arc, range: radar.range },
            XY.angleOf(diff),
            XY.lengthOf(diff),
            target.radius,
        );
    }

    /**
     * A full-circle mount (`bearingLimit` 180) turns continuously; a limited one swings between its limits.
     * Ping-pong at ±180 would not work: both limits are the same bearing, so the swing would end at once.
     */
    private sweep(radar: Radar) {
        if (radar.bearingLimit >= 180) {
            radar.bearingCommand = toDegreesDelta(radar.bearing + SWEEP_LEAD_DEGREES);
            return;
        }
        let direction = this.sweepDirection.get(radar) ?? 1;
        if (direction * radar.bearing >= radar.bearingLimit - 0.5) {
            direction = -direction;
        }
        this.sweepDirection.set(radar, direction);
        radar.bearingCommand = direction * radar.bearingLimit;
    }
}
