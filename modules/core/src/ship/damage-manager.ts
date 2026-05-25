import {
    AmmoType,
    ChainGun,
    Damage,
    HullOutcome,
    RTuple2,
    ShipArea,
    SmartPilot,
    SpaceManager,
    Spaceship,
    SystemDamageProfile,
    archIntersection,
    capToRange,
    damageMultiplierForOutcome,
    isSurfaceEffectAmmo,
    limitPercision,
    projectileModels,
    resolveHullOutcome,
    shipAreasInRange,
    systemDamageProfile,
} from '..';
import { Die, ShipSystem } from './ship-manager-abstract';
import { FRONT_ARC, REAR_ARC } from '.';

import { ArmorType } from '../logic/damage-matrix';

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

// Severity scales the incoming damage when applied to systems. Mirrors the
// "low / medium / high" rows of the System Damage Profile table in #1929.
const SEVERITY_FACTOR: Record<SystemDamageProfile['severity'], number> = {
    low: 0.5,
    medium: 1,
    high: 2,
};

// Classify systems as electronics (EMP-vulnerable) and as internal/external
// (used by ammo system-damage scope). Defaults to "internal electronics"
// when a system isn't explicitly listed, since most ship subsystems are both.
//   - external: exposed to direct hull fire (sensors, antennas, mounts).
//   - internal: deep-hull components.
//   - electronics: targeted by EMP regardless of position.
function isElectronicsSystem(system: ShipSystem): boolean {
    return (
        Radar.isInstance(system) ||
        SmartPilot.isInstance(system) ||
        Reactor.isInstance(system) ||
        Warp.isInstance(system) ||
        Signals.isInstance(system) ||
        Docking.isInstance(system) ||
        Magazine.isInstance(system) ||
        ChainGun.isInstance(system)
    );
}

function isExternalSystem(system: ShipSystem): boolean {
    return (
        Radar.isInstance(system) ||
        Signals.isInstance(system) ||
        ChainGun.isInstance(system) ||
        Docking.isInstance(system) ||
        Thruster.isInstance(system)
    );
}

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

    private effectiveArmorType(ammo: AmmoType): ArmorType {
        const armor = this.state.armor;
        // Faraday is layerable on top of any other armor; it only matters
        // for EMP. For physical ammo we fall through to the primary armor.
        if (ammo === 'MissileEmp' && armor.hasFaradayLayer) {
            return 'Faraday';
        }
        return armor.type;
    }

    public takeExternalDamage(damage: Damage): boolean {
        if (!damage.ammoType) {
            // Non-projectile sources (collisions, GM-spawned explosions) skip
            // the matrix and use the original flat-damage flow.
            return this.takeFlatDamage(damage);
        }
        const ammo = damage.ammoType;
        const armor = this.effectiveArmorType(ammo);
        const outcome = resolveHullOutcome(ammo, armor);
        const multiplier = damageMultiplierForOutcome(outcome);
        const profile = systemDamageProfile(ammo);

        if (outcome === 'ignores') {
            // Two distinct cases collapse here:
            //   * EMP vs any non-Faraday armor: weapon walks past plates and
            //     fries every electronic system on the ship.
            //   * Physical ammo vs pure Faraday primary: Faraday doesn't
            //     stop physical hits at all, so the projectile lands on
            //     internals at full system-damage strength.
            this.applyMatrixSystemDamage(damage, profile, /* multiplier */ 1);
            return true;
        }

        if (outcome === 'resist') {
            // Hull holds. Surface-effect ammo (HE/Frag/Cluster) still scrapes
            // external systems; clean penetrators just bounce.
            if (isSurfaceEffectAmmo(ammo)) {
                this.applyMatrixSystemDamage(damage, profile, multiplier);
                return true;
            }
            return false;
        }

        // normal / vulnerable / critical: plate damage + system damage.
        let damagedInternals = false;
        for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {
            const areaArc = hitArea === ShipArea.front ? FRONT_ARC : REAR_ARC;
            const areaHitRangeAngles = archIntersection(areaArc, damage.damageSurfaceArc);
            if (!areaHitRangeAngles) continue;

            if (this.state.armor.type === 'Reactive') {
                // Each plate is a one-shot ERA cell. Any non-resist physical
                // hit strips the cells in the hit range. On Critical (Tandem)
                // the precursor pops the cell AND the main warhead lands.
                this.consumeReactiveCells(areaHitRangeAngles);
            } else {
                this.applyDamageToArmor(damage.amount * multiplier, areaHitRangeAngles);
            }

            const platesInArea = this.state.armor.numberOfPlatesInRange(areaArc);
            const broken = this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles);
            const exposureRatio = outcome === 'critical' ? 1 : platesInArea > 0 ? broken / platesInArea : 0;

            if (exposureRatio > 0) {
                damagedInternals =
                    this.applySystemDamageToArea(damage, profile, multiplier, hitArea, exposureRatio, outcome) ||
                    damagedInternals;
            }
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

    private applyMatrixSystemDamage(damage: Damage, profile: SystemDamageProfile, multiplier: number): void {
        const severity = SEVERITY_FACTOR[profile.severity];
        const scaled: Damage = { ...damage, amount: damage.amount * multiplier * severity };
        const candidates = this.systemsForScope(profile.scope, damage.damageSurfaceArc);
        if (candidates.length === 0) return;

        if (profile.scope.startsWith('single-')) {
            const idx = this.die.getRollInRange(`pickSystem:${damage.id}`, 0, candidates.length);
            this.damageSystem(candidates[Math.floor(idx)], scaled, 1);
        } else {
            // Critical handling lives in applySystemDamageToArea; this path is
            // only reached for 'ignores' / 'resist' outcomes (EMP, surface-effect).
            for (const system of candidates) {
                this.damageSystem(system, scaled, 1);
            }
        }
    }

    private filterSystemsByScope(systems: ShipSystem[], scope: SystemDamageProfile['scope']): ShipSystem[] {
        switch (scope) {
            case 'multi-electronics':
                return systems.filter(isElectronicsSystem);
            case 'single-internal':
            case 'multi-internal':
                return systems.filter((s) => !isExternalSystem(s));
            case 'single-external':
            case 'multi-external':
                return systems.filter(isExternalSystem);
        }
    }

    private systemsForScope(scope: SystemDamageProfile['scope'], surfaceArc: RTuple2): ShipSystem[] {
        // EMP-style ship-wide electronics damage ignores the hit arc.
        const pool = scope === 'multi-electronics' ? this.state.systems() : this.collectAreaSystems(surfaceArc);
        return this.filterSystemsByScope(pool, scope);
    }

    private collectAreaSystems(surfaceArc: RTuple2): ShipSystem[] {
        const collected: ShipSystem[] = [];
        for (const hitArea of shipAreasInRange(surfaceArc)) {
            collected.push(...(this.state.systemsByAreas(hitArea) || []));
        }
        return collected;
    }

    private applySystemDamageToArea(
        damage: Damage,
        profile: SystemDamageProfile,
        multiplier: number,
        hitArea: ShipArea,
        exposureRatio: number,
        outcome: HullOutcome,
    ): boolean {
        const severity = SEVERITY_FACTOR[profile.severity];
        const scaled: Damage = { ...damage, amount: damage.amount * multiplier * severity };
        // multi-electronics is ship-wide, not area-local; everything else is
        // scoped to the systems on this facing.
        const pool = profile.scope === 'multi-electronics' ? this.state.systems() : this.state.systemsByAreas(hitArea);
        const filtered = this.filterSystemsByScope(pool || [], profile.scope);
        if (filtered.length === 0) return false;

        const isSingle = profile.scope.startsWith('single-');
        if (isSingle) {
            const idx = this.die.getRollInRange(`pickSystem:${damage.id}`, 0, filtered.length);
            this.damageSystem(filtered[Math.floor(idx)], scaled, exposureRatio);
        } else {
            const ratio = outcome === 'critical' ? Math.min(1, exposureRatio * 2) : exposureRatio;
            for (const system of filtered) {
                this.damageSystem(system, scaled, ratio);
            }
        }
        return true;
    }

    private consumeReactiveCells(localAngleHitRange: RTuple2): void {
        for (const [_, plate] of this.state.armor.platesInRange(localAngleHitRange)) {
            if (plate.health > 0) {
                plate.health = 0;
            }
        }
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
            magazine[`count_${projectileKey}`] = Math.round(
                magazine[`count_${projectileKey}`] * (1 - magazine.design.capacityDamageFactor),
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
