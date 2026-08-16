import { EPSILON, capToRange, degToRad, lerp } from '../logic/formulas';
import { Turret, TurretDesign, TurretDesignState } from './turret';

import { commandable, gameField } from '../game-field';
import { defectible } from './system';
import { range } from '../range';
import { tweakable } from '../tweakable';

export type RadarDesign = TurretDesign & {
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
     * degraded floor (m): the radius a fully malfunctioning radar falls back to, stated at
     * `defaultArc` — same convention as `range`. Widening the arc trades this floor for coverage
     * exactly as it trades the nominal `range`, since both derive from the same fixed sweep area
     * (`RadarDesignState.malfunctionArea`) via `radarRangeFromArea(area, arc)`.
     */
    malfunctionRange: number;
};

export class RadarDesignState extends TurretDesignState implements RadarDesign {
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
 * how far accumulated radar damage sits from either extreme: 0 when undamaged or fully pinned to
 * the floor, peaking at 0.5 around mid-damage. Deliberately symmetric (`min(d, 1-d)`, not merely
 * decreasing past the midpoint): a nearly-destroyed radar (damage near 1) settles at its floor
 * with the same small, fast jitter a lightly damaged one (damage near 0) has near full range,
 * rather than spiking back toward full or dwelling in a slow, wide swing right at the floor.
 *
 * Both the malfunction wobble's amplitude (`malfunctionAreaFactor` below) and its noise frequency
 * (`malfunctionNoiseFrequencyHz`) derive from this single curve — amplitude scales with it
 * directly, frequency inversely — so "amplitude × frequency stays roughly constant across damage
 * levels" is a property of sharing one driver, not a coincidence of two independently-tuned
 * curves. One consequence worth calling out: because both peak/trough together at `d = 0.5`, the
 * slowest, widest swings happen with the wobble centered at the range *midpoint* — never near the
 * floor, since severity (and therefore amplitude and slow frequency) has already receded by the
 * time damage pulls the center that low.
 */
export function malfunctionSeverity(malfunctionRangeFactor: number) {
    const damage = capToRange(0, 1, malfunctionRangeFactor);
    return Math.min(damage, 1 - damage);
}

/**
 * blend weight in [0, 1] between a radar's degraded floor area (0) and its full design area (1),
 * for a given damage severity and a smooth noise sample.
 *
 * `malfunctionRangeFactor` (damage severity) is clamped to [0, 1] for the shape of the curve: 0
 * is undamaged (always 1, full area, `noiseSample` has no effect) and 1+ is fully malfunctioning
 * (always 0, floor area, pinned regardless of `noiseSample`). In between, the blend centers on
 * `1 - damage` and wobbles around that center with an amplitude that is widest at the midpoint
 * and tapers to 0 at both damage extremes (`malfunctionSeverity`). So a lightly damaged radar
 * only wavers near full area — it never dips toward the floor — and a nearly-destroyed one
 * settles at the floor without spiking back toward full. `rangeEaseFactor` caps how wide that
 * wobble can ever get.
 *
 * `noiseSample` is expected in [0, 1) (e.g. `ShipDie.getDrift`'s value-noise output): smooth and
 * non-periodic, so the resulting curve reads as an unpredictable radar struggling, not a metronome.
 */
export function malfunctionAreaFactor(malfunctionRangeFactor: number, rangeEaseFactor: number, noiseSample: number) {
    if (malfunctionRangeFactor <= 0) {
        return 1;
    }
    const center = 1 - capToRange(0, 1, malfunctionRangeFactor);
    const amplitude = rangeEaseFactor * malfunctionSeverity(malfunctionRangeFactor);
    const offset = (noiseSample - 0.5) * 2; // rescale [0, 1) noise to [-1, 1)
    return capToRange(0, 1, center + amplitude * offset);
}

/** bounds (Hz) `malfunctionNoiseFrequencyHz` clamps its result to — see that function. */
export const RADAR_MALFUNCTION_MIN_DRIFT_HZ = 0.15;
export const RADAR_MALFUNCTION_MAX_DRIFT_HZ = 1.5;
/**
 * `malfunctionNoiseFrequencyHz`'s inverse-proportionality constant: `frequency = this / severity`
 * (clamped), paired with `malfunctionAreaFactor`'s `amplitude = rangeEaseFactor * severity` — see
 * `malfunctionSeverity`'s doc for why that keeps `amplitude × frequency` roughly constant.
 */
export const RADAR_MALFUNCTION_RATE_CONSTANT_HZ = 0.1;

/**
 * median wander frequency (Hz) for a malfunctioning radar's noise, given its damage severity.
 * Inversely proportional to `malfunctionSeverity` — light damage (severity near 0, close to
 * either damage extreme) wanders fast and shallow (jitter); mid-range damage (severity near its
 * 0.5 peak) wanders slow and deep. Clamped to a sane band so it never free-falls to 0 or spikes
 * to an unplayable flicker rate as severity approaches 0.
 */
export function malfunctionNoiseFrequencyHz(malfunctionRangeFactor: number) {
    const severity = malfunctionSeverity(malfunctionRangeFactor);
    return capToRange(
        RADAR_MALFUNCTION_MIN_DRIFT_HZ,
        RADAR_MALFUNCTION_MAX_DRIFT_HZ,
        RADAR_MALFUNCTION_RATE_CONSTANT_HZ / Math.max(severity, EPSILON),
    );
}

/** duck-typed subset of `ShipManagerAbstract`'s `Die` — narrow to avoid a circular import. */
export type NoiseSource = {
    getDrift(id: string, frequencyHz?: number): number;
    getDriftInRange(id: string, min: number, max: number, frequencyHz?: number): number;
};

/** how far the noise frequency wanders (as a fraction) around its damage-derived median. */
const RADAR_MALFUNCTION_FREQUENCY_WANDER_FRACTION = 0.3;
/** rate (Hz) at which the noise frequency itself wanders around its damage-derived median. */
const RADAR_MALFUNCTION_FREQUENCY_META_HZ = 0.15;

/**
 * samples a malfunctioning radar's `areaFactor` at the die's current game time: the noise
 * frequency wanders (`getDriftInRange`) around `malfunctionNoiseFrequencyHz`'s damage-derived
 * median, then the noise itself is sampled (`getDrift`) at that frequency and fed through
 * `malfunctionAreaFactor`. Exported (not folded into `ShipManagerAbstract`) so its rate-of-change
 * — the `amplitude × frequency` invariant — is directly measurable in tests against a real `Die`,
 * not re-derived from the implementation's own formula.
 */
export function sampleRadarAreaFactor(
    die: NoiseSource,
    key: string,
    malfunctionRangeFactor: number,
    rangeEaseFactor: number,
) {
    if (malfunctionRangeFactor <= 0) {
        return 1;
    }
    const medianFrequency = malfunctionNoiseFrequencyHz(malfunctionRangeFactor);
    const frequency = die.getDriftInRange(
        `${key}:frequency`,
        Math.max(RADAR_MALFUNCTION_MIN_DRIFT_HZ, medianFrequency * (1 - RADAR_MALFUNCTION_FREQUENCY_WANDER_FRACTION)),
        Math.min(RADAR_MALFUNCTION_MAX_DRIFT_HZ, medianFrequency * (1 + RADAR_MALFUNCTION_FREQUENCY_WANDER_FRACTION)),
        RADAR_MALFUNCTION_FREQUENCY_META_HZ,
    );
    const noiseSample = die.getDrift(`${key}:noise`, frequency);
    return malfunctionAreaFactor(malfunctionRangeFactor, rangeEaseFactor, noiseSample);
}

export class Radar extends Turret {
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

    /**
     * false while the reactor cannot feed this radar. An unpowered radar sees nothing at all —
     * unlike a malfunctioning one, which degrades toward its floor. Not synced: clients read the
     * resulting geometry off `Spaceship.radarSectors`.
     */
    public powered = true;

    get broken() {
        return super.broken || this.malfunctionRangeFactor >= 1 - this.design.rangeEaseFactor * 2;
    }

    /**
     * the radius this radar currently reaches, given its power/hack state, malfunction damage and
     * arc. Scales with the square root of effectiveness, since effectiveness scales the swept area.
     *
     * Malfunction damage (`malfunctionRangeFactor`) always flows through the `areaFactor` blend —
     * it never forces this to a literal 0, only smoothly toward `design.malfunctionRange`. A radar
     * `broken` purely from malfunction still floors this way (see the `broken` getter above: it
     * still governs turn speed, kill-ratio accounting and DISABLED status, but not range here).
     *
     * `super.broken` (skew jammed past the mount's physical limit) is a distinct failure: the dish
     * is stuck pointed away from where it's commanded, not merely weak-signaled, so unlike
     * malfunction it does black this out — same as losing power (`!this.powered`).
     */
    get range() {
        if (!this.powered || super.broken) {
            return 0;
        }
        const effectiveArea =
            lerp([0, 1], [this.design.malfunctionArea, this.design.area], this.areaFactor) * this.power * this.hacked;
        return radarRangeFromArea(effectiveArea, this.arc);
    }
}
