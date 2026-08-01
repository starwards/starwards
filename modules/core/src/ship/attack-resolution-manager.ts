import { Damage, RTuple2, ShipArea, archIntersection, shipAreasInRange } from '..';
import { DamageProfile, WeaponDamageType } from '../space/damage-profile';
import { FRONT_ARC, REAR_ARC } from '.';

import { ArmorPlate } from './armor';
import { ShipState } from './ship-state';
import { ShipSystem } from './ship-manager-abstract';

/**
 * Explosion damage arrives per tick (damageFactor × dt × capped overlap), so this is
 * calibrated for sanding over a full cloud pass (a handful of small defects), not instant kills.
 */
const SURFACE_EFFECT_FACTOR = 0.05;

export type AttackDamage = Damage & {
    damageType: WeaponDamageType;
    profile: DamageProfile;
};

export type AreaExposure = { hitArea: ShipArea; exposure: number };

/** the surface channel's targets and pre-armor scaled amount — armor never gates it */
export type SurfaceChannelHit = { systems: ShipSystem[]; amount: number };

export type AttackResolution = {
    surfaceChannel: SurfaceChannelHit | null;
    exposures: AreaExposure[];
};

/**
 * Spec §1-3, §6: resolves a weapon hit up to the point system damage begins — delivery is
 * already baked into `damage` (impact vs explosion, arriving as one event or a stream), so this
 * walks the armor stack (armor engagement) and splits the result into the two channels damage
 * can reach systems through (penetration vs surface). Nothing here rolls a defect or touches a
 * system's damage50 — that stays in DamageManager, which applies this resolution.
 */
export class AttackResolutionManager {
    constructor(private state: ShipState) {}

    resolveAttack(damage: AttackDamage): AttackResolution {
        return {
            surfaceChannel: this.resolveSurfaceChannel(damage),
            exposures: this.resolvePenetrationChannel(damage),
        };
    }

    /**
     * hull-mounted equipment sits outside every armor model — blast/shrapnel scrapes it
     * regardless of the plates
     */
    private resolveSurfaceChannel(damage: AttackDamage): SurfaceChannelHit | null {
        const { profile } = damage;
        if (!profile.surfaceEffect) {
            return null;
        }
        return {
            systems: this.collectAreaSystems(damage.damageSurfaceArc).filter((system) => !system.isInternal),
            amount: damage.amount * SURFACE_EFFECT_FACTOR * profile.surfaceDamageFactor,
        };
    }

    private resolvePenetrationChannel(damage: AttackDamage): AreaExposure[] {
        const exposures: AreaExposure[] = [];
        for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {
            const areaArc = hitArea === ShipArea.front ? FRONT_ARC : REAR_ARC;
            const areaHitRangeAngles = archIntersection(areaArc, damage.damageSurfaceArc);
            if (!areaHitRangeAngles) {
                continue;
            }
            const exposure = this.walkArmorLayers(damage, areaHitRangeAngles, areaArc);
            if (exposure > 0) {
                exposures.push({ hitArea, exposure });
            }
        }
        return exposures;
    }

    /**
     * Spec §6 resolution walk, one plate at a time: each plate in the hit arc is walked
     * independently through its own layer stack, using only its own share of the hit — the
     * fraction of the hit's own angular width that lands on that specific plate (1 when the
     * entire hit sits within that one plate, less when the hit is spread across several
     * plates). Plates are exclusive to each other: one plate's outcome (block, erosion, chain)
     * never depends on another plate's state. The hit meets each layer outermost-in;
     * transparent layers are skipped, an intact blocking layer stops that plate's chain,
     * engaging layers erode (scaled by the chain so far and the plate's own share of the hit)
     * and leak inward through their exposure — max(penetration, broken) — chaining
     * multiplicatively down the stack. The area's final exposure is each plate's chain weighted
     * by how many of the hit's degrees landed on it, averaged over the area's full angular
     * width (including any of its plates outside this particular hit).
     *
     * Reactive cells (`singleUsePlates`) trigger on impact delivery only: one cell across the
     * whole hit pops and the hit is defeated for that plate (exposure measured pre-pop) unless
     * the round fully penetrates (Tandem). Explosions erode the cells like ordinary plates — no
     * pop, no defeat.
     */
    private walkArmorLayers(damage: AttackDamage, areaHitRangeAngles: RTuple2, areaArc: RTuple2): number {
        const armor = this.state.armor;
        const platesInArea = armor.numberOfPlatesInRange(areaArc);
        if (platesInArea <= 0) {
            return 0;
        }
        const totalAreaDegrees = platesInArea * armor.degreesPerPlate;
        const hits = [...armor.plateHitOverlaps(areaHitRangeAngles)];
        const hitSize = hits.reduce((sum, [, overlap]) => sum + overlap, 0);
        if (hitSize <= 0) {
            return 0;
        }
        const cellBudget = { popped: false };
        let exposureSum = 0;
        for (const [plate, overlap] of hits) {
            const share = overlap / hitSize;
            const chain = this.walkPlateLayers(plate, damage, damage.amount * share, cellBudget);
            exposureSum += chain * overlap;
        }
        return exposureSum / totalAreaDegrees;
    }

    /** walks a single plate's own layer stack, independent of every other plate in the hit */
    private walkPlateLayers(
        plate: ArmorPlate,
        damage: AttackDamage,
        amount: number,
        cellBudget: { popped: boolean },
    ): number {
        let chain = 1;
        for (const layer of plate.layers) {
            if (chain <= 0) {
                break;
            }
            const response = layer.design.response(damage.damageType);
            if (response.kind === 'bypass') {
                continue;
            }
            if (response.kind === 'block') {
                chain *= layer.broken ? 1 : 0;
                continue;
            }
            if (layer.design.singleUsePlates && damage.delivery === 'impact') {
                const bareBeforePop = layer.broken ? 1 : 0;
                if (!cellBudget.popped && !layer.broken) {
                    // a single reactive cell sacrifices itself to defeat the whole hit
                    layer.health = 0;
                    cellBudget.popped = true;
                    chain *= Math.max(response.penetration, bareBeforePop);
                    if (response.penetration < 1) {
                        // exposure measured pre-pop; deeper layers on this plate never see this round
                        return chain;
                    }
                    continue;
                }
                chain *= Math.max(response.penetration, bareBeforePop);
                continue;
            }
            layer.health = Math.max(layer.health - amount * response.plateFactor * chain, 0);
            chain *= Math.max(response.penetration, layer.broken ? 1 : 0);
        }
        return chain;
    }

    private collectAreaSystems(surfaceArc: RTuple2): ShipSystem[] {
        const collected: ShipSystem[] = [];
        for (const hitArea of shipAreasInRange(surfaceArc)) {
            collected.push(...(this.state.systemsByAreas(hitArea) || []));
        }
        return collected;
    }
}
