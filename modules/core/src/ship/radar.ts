import { DesignState, SystemState } from './system';
import { capToRange, degToRad, lerp } from '../logic/formulas';

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
    /**
     * nominal detection radius (m) at `defaultArc`, at full effectiveness. The sweep area is
     * derived from it, so this is the single knob that sizes the radar.
     */
    range: number;
    /**
     * narrowest arc (degrees) the radar can be set to. Equal to `maxArc` for a fixed omni radar.
     */
    minArc: number;
    /**
     * widest arc (degrees) the radar can be set to.
     */
    maxArc: number;
    /**
     * arc (degrees) the radar is fitted with, and the arc at which `range` is stated.
     */
    defaultArc: number;
    /**
     * in energy per 1000m per second
     */
    energyCost: number;
    /**
     * percent of the time in which the range is easing from/to range
     */
    rangeEaseFactor: number;
    /**
     * degraded floor (m): the radius a fully malfunctioning radar falls back to.
     */
    malfunctionRange: number;
};

export class RadarDesignState extends DesignState implements RadarDesign {
    @gameField('float32') damage50 = 0;
    @gameField('float32') range = 0;
    @gameField('float32') minArc = 360;
    @gameField('float32') maxArc = 360;
    @gameField('float32') defaultArc = 360;
    @gameField('float32') energyCost = 0;
    @gameField('float32') rangeEaseFactor = 0;
    @gameField('float32') malfunctionRange = 0;

    /**
     * sweep area the radar can spread over its arc, derived live from `range` and `defaultArc`
     * so a GM edit to either immediately moves the real radar. The project normalization is
     * `area = range^2 * arc * degToRad` (twice the geometric sector area, deliberately).
     */
    get area() {
        return areaFromRadarRange(this.range, this.defaultArc);
    }

    /**
     * the sweep area a fully malfunctioning radar falls back to.
     */
    get malfunctionArea() {
        return areaFromRadarRange(this.malfunctionRange, this.defaultArc);
    }
}

/**
 * inverse of the area normalization: the radius a given sweep area covers when spread over `arcDeg`.
 * Widening the arc at constant area shortens the reach, and vice versa.
 */
export function radarRangeFromArea(effectiveArea: number, arcDeg: number) {
    if (effectiveArea <= 0 || arcDeg <= 0) {
        return 0;
    }
    return Math.sqrt(effectiveArea / (arcDeg * degToRad));
}

export function areaFromRadarRange(rangeMeters: number, arcDeg: number) {
    return rangeMeters * rangeMeters * arcDeg * degToRad;
}

/**
 * blend weight in [0, 1] between a radar's degraded floor area (0) and its full design area (1).
 * A healthy radar (`malfunctionRangeFactor` 0) always returns 1. A damaged one fluctuates: the
 * wave sample sweeps an easing window `[malfunctionRangeFactor, malfunctionRangeFactor + rangeEaseFactor]`,
 * below which the radar sits at its floor and above which it reaches full area.
 */
export function malfunctionAreaFactor(malfunctionRangeFactor: number, rangeEaseFactor: number, waveSample: number) {
    if (malfunctionRangeFactor <= 0) {
        return 1;
    }
    const easeFrom = malfunctionRangeFactor;
    const easeTo = malfunctionRangeFactor + rangeEaseFactor;
    if (easeTo <= easeFrom) {
        return waveSample >= easeFrom ? 1 : 0;
    }
    return capToRange(0, 1, lerp([easeFrom, easeTo], [0, 1], capToRange(easeFrom, easeTo, waveSample)));
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
     * The bearing this radar sweeps, in relation to the ship. (in degrees, 0 is front)
     */
    @range(shipDirectionRange)
    @tweakable('number')
    @commandable()
    @gameField('float32')
    direction = 0;

    /**
     * backing store for `arc`. 0 means "as fitted", i.e. follow `design.defaultArc` — which is
     * only known once the design is assigned, after construction.
     */
    @gameField('float32')
    arcSetting = 0;

    /**
     * the arc (degrees) this radar spreads its sweep area over. Widening it trades reach for
     * coverage at constant area. An omni radar is pinned to 360 by its design limits.
     */
    @range((t: Radar) => [t.design.minArc, t.design.maxArc])
    @tweakable('number')
    @commandable()
    get arc(): number {
        return this.arcSetting || this.design.defaultArc;
    }

    set arc(value: number) {
        this.arcSetting = value;
    }

    /**
     * live blend weight between the design's malfunction floor area and its full area, driven by
     * the ship manager's malfunction wave each tick. Not synced: clients read the resulting
     * geometry off `Spaceship.radarSectors`.
     */
    public areaFactor = 1;

    get broken() {
        return this.malfunctionRangeFactor >= 1 - this.design.rangeEaseFactor * 2;
    }

    /**
     * the radius this radar currently reaches, given its effectiveness, malfunction state and arc.
     * Scales with the square root of effectiveness, since effectiveness scales the swept area.
     */
    get range() {
        const effectiveArea =
            lerp([0, 1], [this.design.malfunctionArea, this.design.area], this.areaFactor) * this.effectiveness;
        return radarRangeFromArea(effectiveArea, this.arc);
    }
}
