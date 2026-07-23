import { DesignState, SystemState } from './system';

import { commandable, gameField } from '../game-field';
import { defectible } from './system';
import { range } from '../range';
import { shipDirectionRange } from './ship-direction';
import { tweakable } from '../tweakable';

export type RadarDesign = {
    modelName?: string;
    isInternal: boolean;
    isElectronics: boolean;
    damage50: number;
    range: number;
    /**
     * in energy per 1000m per second
     */
    energyCost: number;
    /**
     * percent of the time in which the range is easing from/to range
     */
    rangeEaseFactor: number;
    malfunctionRange: number;
    /**
     * fixed sector area (m^2) of the directional scan beam. 0 = ship has no scan beam.
     */
    beamArea: number;
};

export class RadarDesignState extends DesignState implements RadarDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') range = 0;
    @gameField('float32') energyCost = 0;
    @gameField('float32') rangeEaseFactor = 0;
    @gameField('float32') malfunctionRange = 0;
    @gameField('float32') beamArea = 0;
}

/** max arc (degrees) the directional scan beam can take, at its widest/shortest shape */
export const SCAN_BEAM_MAX_ARC_DEG = 90;
/** max radius (m) the directional scan beam can take, at its narrowest/longest shape */
export const SCAN_BEAM_MAX_RADIUS = 20_000;

export type ScanBeamGeometry = { arc: number; radius: number };

/**
 * Derives the beam's (arc, radius) from a fixed sector area and a 0-1 shape scalar, trading
 * arc against radius at constant area (sector area = 1/2 * arc(rad) * radius^2). shape=0 is
 * wide-and-short (arc pinned to SCAN_BEAM_MAX_ARC_DEG, radius at its minimum); shape=1 is
 * narrow-and-long (radius pinned to SCAN_BEAM_MAX_RADIUS). Radius is clamped so a badly-tuned
 * beamArea can never push either hard limit past its bound.
 */
export function calcScanBeamGeometry(beamArea: number, shape: number): ScanBeamGeometry {
    if (beamArea <= 0) {
        return { arc: 0, radius: 0 };
    }
    const maxArcRad = (SCAN_BEAM_MAX_ARC_DEG * Math.PI) / 180;
    const minRadius = Math.sqrt((2 * beamArea) / maxArcRad);
    const clampedShape = Math.min(1, Math.max(0, shape));
    const radius = Math.min(SCAN_BEAM_MAX_RADIUS, minRadius + (SCAN_BEAM_MAX_RADIUS - minRadius) * clampedShape);
    const arcRad = (2 * beamArea) / (radius * radius);
    const arc = Math.min(SCAN_BEAM_MAX_ARC_DEG, (arcRad * 180) / Math.PI);
    return { arc, radius };
}
export class Radar extends SystemState {
    public static isInstance = (o: unknown): o is Radar => {
        return (o as Radar)?.type === 'Radar';
    };

    public readonly type = 'Radar';
    public readonly name = 'Radar';

    @gameField(RadarDesignState)
    design = new RadarDesignState();

    /**
     * percent of the time in which the range is malfunctionRange
     */
    @defectible({ normal: 0, name: 'range fluctuation' })
    @range((t: Radar) => [0, 1 - t.design.rangeEaseFactor * 2])
    @gameField('float32')
    malfunctionRangeFactor = 0;

    /*!
     *The bearing of the directional scan beam, in relation to the ship. (in degrees, 0 is front)
     */
    @range(shipDirectionRange)
    @tweakable('number')
    @commandable()
    @gameField('float32')
    beamDirection = 0;

    /**
     * trades the scan beam's arc against its radius at constant sector area: 0 is
     * wide-and-short, 1 is narrow-and-long. See `calcScanBeamGeometry`.
     */
    @range([0, 1])
    @tweakable('number')
    @commandable()
    @gameField('float32')
    beamShape = 0;

    get broken() {
        return this.malfunctionRangeFactor >= 1 - this.design.rangeEaseFactor * 2;
    }
}
