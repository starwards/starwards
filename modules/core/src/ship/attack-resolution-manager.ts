import { Damage, RTuple2, ShipArea, archIntersection, shipAreasInRange } from '..';
import { DamageProfile, WeaponDamageType } from '../space/damage-profile';
import { Die, ShipSystem } from './ship-manager-abstract';
import { FRONT_ARC, REAR_ARC } from '.';

import { ArmorPlate } from './armor';
import { ShipState } from './ship-state';

/**
 * Explosion damage arrives per tick (damageFactor × dt × capped overlap), so this is
 * calibrated for sanding over a full cloud pass (a handful of small defects), not instant kills.
 */
const SURFACE_EFFECT_FACTOR = 0.05;

export type AttackDamage = Damage & {
    damageType: WeaponDamageType;
    profile: DamageProfile;
};

/**
 * One system's share of a resolved attack, ready for defect rolls — armor engagement and
 * channel split have already been decided; nothing here still depends on armor state.
 */
export type ResolvedSystemHit = {
    system: ShipSystem;
    damage: { id: string; amount: number };
    percentageOfBrokenPlates: number;
};

export type WeaponAttackResolution = {
    /** ordered surface-channel hits first, then penetration-channel hits */
    hits: ResolvedSystemHit[];
    /** true iff this damage type scrapes hull-mounted systems regardless of armor (profile-level, not hit-count) */
    damagedExternals: boolean;
};

type AreaExposure = { hitArea: ShipArea; exposure: number };

/**
 * Resolves a damage event against a ship's armor: delivery (impact/explosion — already decided
 * by the caller via `AttackDamage.delivery`), armor engagement (layer walk, exposure), and
 * channel split (penetration vs surface). Produces the list of systems that should take defect
 * rolls; it never rolls dice for defects itself — that is `DamageManager`'s job, after
 * resolution.
 */
export class AttackResolutionManager {
    constructor(
        private state: ShipState,
        private die: Die,
    ) {}

    resolveWeaponAttack(damage: AttackDamage): WeaponAttackResolution {
        const { profile } = damage;
        const hits: ResolvedSystemHit[] = [];
        const damagedExternals = profile.surfaceEffect;
        if (damagedExternals) {
            const scaled = {
                id: damage.id,
                amount: damage.amount * SURFACE_EFFECT_FACTOR * profile.surfaceDamageFactor,
            };
            for (const system of this.collectAreaSystems(damage.damageSurfaceArc)) {
                if (!system.isInternal) {
                    hits.push({ system, damage: scaled, percentageOfBrokenPlates: 1 });
                }
            }
        }
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
        hits.push(...this.resolvePenetrationChannel(damage, exposures));
        return { hits, damagedExternals };
    }

    resolveCollisionAttack(damage: Damage): ResolvedSystemHit[] {
        const hits: ResolvedSystemHit[] = [];
        for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {
            const areaArc = hitArea === ShipArea.front ? FRONT_ARC : REAR_ARC;
            const areaHitRangeAngles = archIntersection(areaArc, damage.damageSurfaceArc);
            if (!areaHitRangeAngles) {
                continue;
            }
            const areaUnarmoredHits = this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles);
            if (areaUnarmoredHits) {
                const platesInArea = this.state.armor.numberOfPlatesInRange(areaArc);
                for (const system of this.state.systemsByAreas(hitArea) || []) {
                    if (system) {
                        hits.push({
                            system,
                            damage: { id: damage.id, amount: damage.amount },
                            percentageOfBrokenPlates: areaUnarmoredHits / platesInArea,
                        });
                    }
                }
            }
            this.applyDamageToArmor(damage.amount, areaHitRangeAngles);
        }
        return hits;
    }

    /**
     * plateDamage governs plate erosion only — once exposed, systems take the round's own
     * damage. Electronics damage is ship-wide, applied once at the worst exposure across
     * areas; other scopes draw from the systems of each exposed area
     */
    private resolvePenetrationChannel(damage: AttackDamage, exposures: AreaExposure[]): ResolvedSystemHit[] {
        const { profile } = damage;
        const scaled = { id: damage.id, amount: damage.amount * profile.systemDamageFactor };
        if (profile.systemScope === 'electronics') {
            const worstExposure = exposures.reduce((r, { exposure }) => Math.max(r, exposure), 0);
            if (worstExposure === 0) {
                return [];
            }
            const electronics = this.filterSystemsByProfile(this.state.systems(), profile);
            return electronics.map((system) => ({ system, damage: scaled, percentageOfBrokenPlates: worstExposure }));
        }
        const candidates = exposures.flatMap(({ hitArea, exposure }) =>
            this.filterSystemsByProfile(this.state.systemsByAreas(hitArea) || [], profile).map((system) => ({
                system,
                exposure,
            })),
        );
        if (candidates.length === 0) {
            return [];
        }
        if (profile.systemScope === 'single') {
            const idx = this.die.getRollInRange(`pickSystem:${damage.id}`, 0, candidates.length);
            const { system, exposure } = candidates[Math.floor(idx)];
            return [{ system, damage: scaled, percentageOfBrokenPlates: exposure }];
        }
        return candidates.map(({ system, exposure }) => ({
            system,
            damage: scaled,
            percentageOfBrokenPlates: exposure,
        }));
    }

    private filterSystemsByProfile(systems: ShipSystem[], profile: DamageProfile): ShipSystem[] {
        if (profile.systemScope === 'electronics') {
            return systems.filter((s) => s.isElectronics);
        }
        return systems.filter((s) => s.isInternal === profile.hitsInternal);
    }

    private collectAreaSystems(surfaceArc: RTuple2): ShipSystem[] {
        const collected: ShipSystem[] = [];
        for (const hitArea of shipAreasInRange(surfaceArc)) {
            collected.push(...(this.state.systemsByAreas(hitArea) || []));
        }
        return collected;
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

    private getNumberOfBrokenPlatesInRange(hitRange: RTuple2): number {
        let brokenPlates = 0;
        for (const [_, plate] of this.state.armor.platesInRange(hitRange)) {
            if (plate.broken) {
                brokenPlates++;
            }
        }
        return brokenPlates;
    }

    private applyDamageToArmor(damageFactor: number, localAnglesHitRange: RTuple2) {
        for (const [_, plate] of this.state.armor.platesInRange(localAnglesHitRange)) {
            const layer = plate.layers.find((l) => l.health > 0);
            if (layer) {
                layer.health = Math.max(layer.health - damageFactor, 0);
            }
        }
    }
}
