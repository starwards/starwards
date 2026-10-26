import { Display } from './controls';
import { Heard } from './callout';
import { Radar } from './verbal';

type FillValues = Record<string, string>;

/** What Signals tells weapons about the armor of the contact marked on Target Details. */
type PlateIntel = {
    /** The plate on the arc facing our ship: down, holding, or unknown while the radar gives no bearing or heading. */
    facing: 'holding' | 'broken' | 'unknown';
    /** The outer armor layer's model (`whipple`, `composite`, `hardened`). */
    model: string;
    holding: number;
    total: number;
};

/** Seconds a plate-intel call stays good for weapons. */
const PLATE_INTEL_FRESH_SECONDS = 30;

type IntelPanel = {
    targetId?: string | null;
    design?: {
        armor: {
            numberOfPlates: number;
            degreesPerPlate: number;
            healthyPlates: number;
            layers: { model: string }[];
            plates: { index: number; broken: boolean }[];
        };
    };
};

/**
 * Signals: the armor of the marked contact from its Target Details panel (live at FULL, frozen at
 * SNAPSHOT), and whether the plate facing our ship is down. Undefined while the panel reveals no armor.
 */
export function plateIntelFill(display: Display): FillValues | undefined {
    const panel = display.panels['target-intel'] as IntelPanel | undefined;
    const armor = panel?.design?.armor;
    if (!panel?.targetId || !armor || armor.numberOfPlates < 1) return undefined;
    const radar = display.radar as Radar | undefined;
    const target = radar?.contacts?.find((c) => c.id === panel.targetId);
    const own = radar?.ownShip?.position;
    let facing: PlateIntel['facing'] = 'unknown';
    if (target?.position && target.heading !== undefined && own) {
        const world = (Math.atan2(own.y - target.position.y, own.x - target.position.x) * 180) / Math.PI;
        const local = (((world - target.heading) % 360) + 360) % 360;
        const index = Math.floor(local / armor.degreesPerPlate) % armor.numberOfPlates;
        facing = armor.plates.find((p) => p.index === index)?.broken ? 'broken' : 'holding';
    }
    return {
        id: panel.targetId,
        name: target?.name ?? panel.targetId,
        model: armor.layers[0]?.model ?? 'unknown',
        holding: String(armor.healthyPlates),
        total: String(armor.numberOfPlates),
        facing,
    };
}

/**
 * Weapons' ammo from the armor intel: AP while the facing plates hold, HE once they are broken; AP
 * against whipple, which AP penetrates fully and HE barely scratches. With the facing plate unknown,
 * HE once most plates are down. With `modelBlind` the model is ignored and only the plate state decides.
 */
export function informedAmmoSide(intel: PlateIntel, modelBlind = false): 'ap' | 'he' {
    if (!modelBlind && intel.model === 'whipple') return 'ap';
    if (intel.facing === 'unknown') return intel.holding * 2 < intel.total ? 'he' : 'ap';
    return intel.facing === 'broken' ? 'he' : 'ap';
}

/** The newest fresh plate-intel call Signals made about `lockId`, as weapons hears it. */
export function heardPlateIntel(
    heard: readonly Heard[] | undefined,
    lockId: string | undefined,
): PlateIntel | undefined {
    if (!lockId) return undefined;
    const call = (heard ?? [])
        .filter(
            (h) =>
                h.speaker === 'signals' &&
                h.callout === 'plate_intel' &&
                h.values?.id === lockId &&
                h.secondsAgo <= PLATE_INTEL_FRESH_SECONDS,
        )
        .sort((a, b) => a.secondsAgo - b.secondsAgo)[0];
    const v = call?.values;
    return (
        v && {
            facing: v.facing === 'broken' || v.facing === 'holding' ? v.facing : 'unknown',
            model: v.model ?? 'unknown',
            holding: Number(v.holding),
            total: Number(v.total),
        }
    );
}
