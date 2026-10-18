import { IterationData, Updateable } from '../updateable';
import { Projectile, isMissile } from '../space/projectile';

import { HeatSink } from './ship-manager-abstract';
import { Radar } from './radar';
import { ScanLevel } from '../space/scan-level';
import { ShipState } from './ship-state';
import { SpaceManager } from '../logic/space-manager';
import { XY } from '../logic/xy';
import { sectorCovers } from '../logic/field-of-view';

/**
 * Beam jamming (M4.27 ruling). While the Signals officer holds a scan beam's jam key the beam
 * heats fast (`design.jamHeatPerSecond`), and every FULL-scanned, unjammed missile it covers is
 * reported to `SpaceManager.coverWithJamBeam`, which raises that missile's `jamLevel`.
 */
export class BeamJamManager implements Updateable {
    constructor(
        private state: ShipState,
        private spaceManager: SpaceManager,
        private heatSink: HeatSink,
    ) {}

    update({ deltaSeconds }: IterationData): void {
        if (deltaSeconds <= 0) {
            return;
        }
        for (const beam of this.state.radars) {
            if (!beam.design.isScanBeam || !beam.jamming || beam.range <= 0) {
                continue;
            }
            this.heatSink.addHeat(beam.design.jamHeatPerSecond * deltaSeconds, beam);
            for (const missile of this.coveredMissiles(beam)) {
                this.spaceManager.coverWithJamBeam(missile);
            }
        }
    }

    private *coveredMissiles(beam: Radar): Iterable<Projectile> {
        const sector = { direction: beam.getGlobalBearing(this.state), arc: beam.arc, range: beam.range };
        for (const missile of this.spaceManager.state.getAll('Projectile')) {
            if (
                !isMissile(missile) ||
                missile.jammed ||
                missile.destroyed ||
                this.spaceManager.factionIntel.getScanLevel(missile.id, this.state.faction) !== ScanLevel.FULL ||
                !this.spaceManager.isVisible(this.state.id, missile.id)
            ) {
                continue;
            }
            const diff = XY.difference(missile.position, this.state.position);
            if (sectorCovers(sector, XY.angleOf(diff), XY.lengthOf(diff), missile.radius)) {
                yield missile;
            }
        }
    }
}
