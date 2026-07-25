import { ArraySchema, Schema } from '@colyseus/schema';
import { gameField } from '../game-field';

/**
 * One radar's contribution to a ship's field of view: a wedge of `arc` degrees centred on the
 * world bearing `direction`, reaching `range` meters. A ship's vision is the union of its sectors,
 * and the sectors are synced so server and client compute the same field of view.
 */
export class RadarSector extends Schema {
    /** world bearing (degrees) the sector is centred on */
    @gameField('float32')
    direction = 0;

    /** width of the sector in degrees */
    @gameField('float32')
    arc = 0;

    /** how far the sector reaches, in meters */
    @gameField('float32')
    range = 0;
}

export type RadarSectorValues = Pick<RadarSector, 'direction' | 'arc' | 'range'>;

/**
 * Gives an object a single 360-degree sector of the given reach, replacing whatever it had.
 */
export function setOmniRadarSector(target: { radarSectors: ArraySchema<RadarSector> }, range: number) {
    applyRadarSectors(target.radarSectors, [{ direction: 0, arc: 360, range }]);
}

/**
 * Writes `values` into `sectors` in place. The schema instances are reused across ticks — a ship's
 * radar count only changes when it is rebuilt — so clients see value patches, not add/remove churn.
 */
export function applyRadarSectors(sectors: ArraySchema<RadarSector>, values: readonly RadarSectorValues[]) {
    while (sectors.length > values.length) {
        sectors.pop();
    }
    for (const [index, value] of values.entries()) {
        let sector = sectors.at(index);
        if (!sector) {
            sector = new RadarSector();
            sectors.push(sector);
        }
        sector.direction = value.direction;
        sector.arc = value.arc;
        sector.range = value.range;
    }
}
