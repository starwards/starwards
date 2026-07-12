import {
    ChainGun,
    Damage,
    RTuple2,
    ShipArea,
    SmartPilot,
    SpaceManager,
    Spaceship,
    archIntersection,
    capToRange,
    limitPercision,
    projectileModels,
    shipAreasInRange,
} from '..';
import { DamageProfile, damageProfiles } from '../space/damage-profile';
import { Die, ShipSystem } from './ship-manager-abstract';
import { FRONT_ARC, REAR_ARC } from '.';

import { DeepReadonly } from 'ts-essentials';
import { Docking } from './docking';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
import NormalDistribution from 'normal-distribution';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { ShipState } from './ship-state';
import { Signals } from './signals';
import { Thruster } from './thruster';
import { Warp } from './warp';

// system damage dealt to external systems by a surface-effect hit. Explosion damage arrives
// per tick (damageFactor x dt x overlap), so this is calibrated for sanding over a full cloud
// pass (a handful of small defects), not instant kills.
const SURFACE_EFFECT_FACTOR = 0.05;

export class DamageManager {
    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
    ) {}

    update() {
        let damagedInternals = false;
        for (const damage of this.spaceManager.resolveObjectDamage(this.spaceObject.id)) {
            damagedInternals = this.takeExternalDamage(damage) || damagedInternals;
        }
        if (damagedInternals && this.spaceObject.expendable) {
            const { count, broken } = this.state
                .systems()
                .map((s) => s.broken)
                .reduce((acc, curr) => ({ count: acc.count + 1, broken: curr ? acc.broken + 1 : acc.broken }), {
                    count: 0,
                    broken: 0,
                });
            if (count * this.state.design.systemKillRatio < broken) {
                this.spaceManager.destroyObject(this.spaceObject.id);
            }
        }
    }

    public takeExternalDamage(damage: Damage): boolean {
        if (!damage.damageType) {
            return this.takeFlatDamage(damage);
        }
        const profile = damageProfiles[damage.damageType];
        const armorDesign = this.state.armor.design;
        const plateFactor = armorDesign.plateDamage(damage.damageType);
        const penetration = armorDesign.penetration(damage.damageType);

        // hull-mounted equipment sits outside every armor model — blast/shrapnel scrapes it
        // regardless of the plates, unless the armor deflects the round before the blast develops
        // (shrapnel clouds are not deflectable)
        let damagedSystems = false;
        if (profile.surfaceEffect && !(profile.deflectable && armorDesign.deflectsSurfaceEffect)) {
            this.applySurfaceEffectDamage(damage, profile);
            damagedSystems = true;
        }

        if (plateFactor === 0) {
            if (penetration >= 1) {
                // the armor does not engage this hit at all
                this.applyPenetratingSystemDamage(damage, profile);
                return true;
            }
            // the armor blocks the hit. Penetration is binary (0 or 1) when the armor does not
            // engage — fractional penetration applies to engaging hits only (see ArmorDesign)
            return damagedSystems;
        }

        let damagedInternals = damagedSystems;
        let electronicsExposure = 0;
        let cellPopped = false;
        for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {
            const areaArc = hitArea === ShipArea.front ? FRONT_ARC : REAR_ARC;
            const areaHitRangeAngles = archIntersection(areaArc, damage.damageSurfaceArc);
            if (!areaHitRangeAngles) continue;

            let broken: number;
            if (armorDesign.singleUsePlates) {
                // exposure is measured before the cell pops: the sacrificed cell defeats this
                // hit, and only already-bare sections (or penetration) let damage through
                broken = this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles);
                if (!cellPopped) {
                    cellPopped = this.consumeSingleUsePlate(areaHitRangeAngles);
                }
            } else {
                this.applyDamageToArmor(damage.amount * plateFactor, areaHitRangeAngles);
                broken = this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles);
            }

            const platesInArea = this.state.armor.numberOfPlatesInRange(areaArc);
            const brokenRatio = platesInArea > 0 ? broken / platesInArea : 0;
            const exposureRatio = Math.max(penetration, brokenRatio);

            if (exposureRatio > 0) {
                if (profile.systemScope === 'electronics') {
                    // electronics damage is ship-wide — collect the worst exposure across areas
                    // and apply it once, outside the per-area loop
                    electronicsExposure = Math.max(electronicsExposure, exposureRatio);
                } else {
                    damagedInternals =
                        this.applySystemDamageToArea(damage, profile, hitArea, exposureRatio) || damagedInternals;
                }
            }
        }
        if (electronicsExposure > 0) {
            damagedInternals = this.applyElectronicsDamage(damage, profile, electronicsExposure) || damagedInternals;
        }
        if (cellPopped && penetration < 1) {
            // the popped reactive cell defeats the hit: the blast/round is consumed and stops
            // dealing damage on subsequent ticks and to other ships
            this.spaceManager.destroyObject(damage.id);
        }
        return damagedInternals;
    }

    private takeFlatDamage(damage: Damage): boolean {
        let damagedInternals = false;
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
                        damagedInternals = true;
                        this.damageSystem(system, damage, areaUnarmoredHits / platesInArea);
                    }
                }
            }
            this.applyDamageToArmor(damage.amount, areaHitRangeAngles);
        }
        return damagedInternals;
    }

    // system damage for hits the armor plates never engage (bypass or blocked surface-effect)
    private applyPenetratingSystemDamage(damage: Damage, profile: DamageProfile): void {
        const scaled: Damage = { ...damage, amount: damage.amount * profile.systemDamageFactor };
        // electronics damage is ship-wide and ignores the hit arc
        const pool =
            profile.systemScope === 'electronics'
                ? this.state.systems()
                : this.collectAreaSystems(damage.damageSurfaceArc);
        const candidates = this.filterSystemsByProfile(pool, profile);
        if (candidates.length === 0) return;

        if (profile.systemScope === 'single') {
            const idx = this.die.getRollInRange(`pickSystem:${damage.id}`, 0, candidates.length);
            this.damageSystem(candidates[Math.floor(idx)], scaled, 1);
        } else {
            for (const system of candidates) {
                this.damageSystem(system, scaled, 1);
            }
        }
    }

    // a surface-effect hit scrapes the external systems in the hit arc
    private applySurfaceEffectDamage(damage: Damage, profile: DamageProfile): void {
        const scaled: Damage = {
            ...damage,
            amount: damage.amount * SURFACE_EFFECT_FACTOR * profile.surfaceDamageFactor,
        };
        for (const system of this.collectAreaSystems(damage.damageSurfaceArc)) {
            if (!system.isInternal) {
                this.damageSystem(system, scaled, 1);
            }
        }
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

    // plateDamage governs plate erosion only — once exposed, systems take the round's own damage
    private applySystemDamageToArea(
        damage: Damage,
        profile: DamageProfile,
        hitArea: ShipArea,
        exposureRatio: number,
    ): boolean {
        const scaled: Damage = { ...damage, amount: damage.amount * profile.systemDamageFactor };
        const filtered = this.filterSystemsByProfile(this.state.systemsByAreas(hitArea) || [], profile);
        if (filtered.length === 0) return false;

        if (profile.systemScope === 'single') {
            const idx = this.die.getRollInRange(`pickSystem:${damage.id}`, 0, filtered.length);
            this.damageSystem(filtered[Math.floor(idx)], scaled, exposureRatio);
        } else {
            for (const system of filtered) {
                this.damageSystem(system, scaled, exposureRatio);
            }
        }
        return true;
    }

    // electronics damage is ship-wide, not area-local
    private applyElectronicsDamage(damage: Damage, profile: DamageProfile, exposureRatio: number): boolean {
        const scaled: Damage = { ...damage, amount: damage.amount * profile.systemDamageFactor };
        const filtered = this.filterSystemsByProfile(this.state.systems(), profile);
        if (filtered.length === 0) return false;
        for (const system of filtered) {
            this.damageSystem(system, scaled, exposureRatio);
        }
        return true;
    }

    // reactive armor: a single cell sacrifices itself to defeat the hit; returns whether a cell popped
    private consumeSingleUsePlate(localAngleHitRange: RTuple2): boolean {
        for (const [_, plate] of this.state.armor.platesInRange(localAngleHitRange)) {
            if (plate.health > 0) {
                plate.health = 0;
                return true;
            }
        }
        return false;
    }

    damageAllSystems(damageObject: { id: string; amount: number }) {
        for (const system of this.state.systems()) {
            this.damageSystem(system, damageObject, 1);
        }
    }

    damageSystem(system: ShipSystem, damageObject: { id: string; amount: number }, percentageOfBrokenPlates: number) {
        if (system.broken) {
            return;
        }
        const dist = new NormalDistribution(system.design.damage50, system.design.damage50 / 2);
        const normalizedDamageProbability = dist.cdf(damageObject.amount * percentageOfBrokenPlates);
        if (this.die.getRoll('damageSystem:' + damageObject.id) < normalizedDamageProbability) {
            if (Thruster.isInstance(system)) {
                this.damageThruster(system, damageObject.id);
            } else if (ChainGun.isInstance(system)) {
                this.damageChainGun(system, damageObject.id);
            } else if (Radar.isInstance(system)) {
                this.damageRadar(system);
            } else if (SmartPilot.isInstance(system)) {
                this.damageSmartPilot(system);
            } else if (Reactor.isInstance(system)) {
                this.damageReactor(system, damageObject.id);
            } else if (Magazine.isInstance(system)) {
                this.damageMagazine(system, damageObject.id);
            } else if (Warp.isInstance(system)) {
                this.damageWarp(system, damageObject.id);
            } else if (Docking.isInstance(system)) {
                this.damageDocking(system);
            } else if (Maneuvering.isInstance(system)) {
                this.damageManeuvering(system, damageObject.id);
            } else if (Signals.isInstance(system)) {
                this.damageSignals(system, damageObject.id);
            }
        }
    }

    damageDocking(docking: Docking) {
        if (docking.broken) {
            return;
        }
        docking.rangesFactor -= 0.05;
    }

    private damageSignals(signals: Signals, damageId: string) {
        if (this.die.getSuccess('damageSignals' + damageId, 0.5)) {
            signals.jobSpeedFactor -= 0.05;
        } else {
            signals.jobSuccessFactor -= 0.05;
        }
    }

    private damageManeuvering(maneuvering: Maneuvering, damageId: string) {
        if (this.die.getSuccess('damageManeuvering:' + damageId, 0.5)) {
            maneuvering.efficiency -= 0.05;
        } else {
            maneuvering.afterBurnerFuel *= 0.9;
        }
    }

    private damageWarp(warp: Warp, damageId: string) {
        if (this.die.getSuccess('damageWarp:' + damageId, 0.5)) {
            warp.damageFactor += 0.05;
        } else {
            warp.velocityFactor *= 0.9;
        }
    }

    private damageMagazine(magazine: Magazine, damageId: string) {
        if (this.die.getSuccess('damageMagazine:' + damageId, 0.5)) {
            // todo convert to a defectible property that accumulates damage
            const idx = this.die.getRollInRange('magazineLostAmmo:' + damageId, 0, projectileModels.length);
            const projectileKey = projectileModels[Math.floor(idx)];
            magazine.setCount(
                projectileKey,
                Math.round(magazine.getCount(projectileKey) * (1 - magazine.design.capacityDamageFactor)),
            );
        } else {
            magazine.capacity *= 1 - magazine.design.capacityDamageFactor;
        }
    }

    private damageReactor(reactor: Reactor, damageId: string) {
        if (this.die.getSuccess('damageReactor:' + damageId, 0.5)) {
            // todo convert to a defectible property that accumulates damage
            reactor.energy *= 0.9;
        } else {
            reactor.effeciencyFactor -= 0.05;
        }
    }

    private damageSmartPilot(smartPilot: SmartPilot) {
        smartPilot.offsetFactor += 0.01;
    }

    private damageRadar(radar: Radar) {
        radar.malfunctionRangeFactor += 0.05;
    }

    private damageThruster(thruster: Thruster, damageId: string) {
        if (this.die.getSuccess('damageThruster:' + damageId, 0.5)) {
            thruster.angleError +=
                limitPercision(this.die.getRollInRange('thrusterAngleOffset:' + damageId, 1, 3)) *
                (this.die.getSuccess('thrusterAngleSign:' + damageId, 0.5) ? 1 : -1);
            thruster.angleError = capToRange(-180, 180, thruster.angleError);
        } else {
            thruster.availableCapacity -= limitPercision(
                this.die.getRollInRange('availableCapacity:' + damageId, 0.01, 0.1),
            );
        }
    }

    private damageChainGun(chainGun: ChainGun, damageId: string) {
        if (this.die.getSuccess('damageChaingun:' + damageId, 0.5)) {
            chainGun.angleOffset +=
                limitPercision(this.die.getRollInRange('chainGunAngleOffset:' + damageId, 1, 2)) *
                (this.die.getSuccess('chainGunAngleSign:' + damageId, 0.5) ? 1 : -1);
        } else {
            chainGun.rateOfFireFactor *= 0.9;
        }
    }

    private getNumberOfBrokenPlatesInRange(hitRange: RTuple2): number {
        let brokenPlates = 0;
        for (const [_, plate] of this.state.armor.platesInRange(hitRange)) {
            if (plate.health <= 0) {
                brokenPlates++;
            }
        }
        return brokenPlates;
    }

    private applyDamageToArmor(damageFactor: number, localAnglesHitRange: RTuple2) {
        for (const [_, plate] of this.state.armor.platesInRange(localAnglesHitRange)) {
            if (plate.health > 0) {
                const newHealth = plate.health - damageFactor;
                plate.health = Math.max(newHealth, 0);
            }
        }
    }
}
