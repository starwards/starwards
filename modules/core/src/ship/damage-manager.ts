import { AreaExposure, AttackDamage, AttackResolutionManager, SurfaceChannelHit } from './attack-resolution-manager';
import {
    ChainGun,
    Damage,
    RTuple2,
    ShipArea,
    SmartPilot,
    SpaceManager,
    Spaceship,
    ammoTypes,
    archIntersection,
    capToRange,
    limitPercision,
    shipAreasInRange,
} from '..';
import { DamageProfile, damageProfiles, isWeaponDamageType } from '../space/damage-profile';
import { Die, ShipSystem } from './ship-manager-abstract';
import { FRONT_ARC, REAR_ARC } from '.';

import { DeepReadonly } from 'ts-essentials';
import { Docking } from './docking';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { ShipState } from './ship-state';
import { Signals } from './signals';
import { Thruster } from './thruster';
import { Warp } from './warp';

export type { AttackDamage } from './attack-resolution-manager';

/**
 * bound on spillover rolls per application: past this point every roll sits at the 0.5 cap and
 * any real system breaks first, so extra iterations change nothing — but an absurd amount
 * (GM overrides, test fixtures) would otherwise grind amount/damage50 steps
 */
const MAX_SPILLOVER_ROLLS = 20;

export class DamageManager {
    private applicationCounter = 0;
    private attackResolutionManager: AttackResolutionManager;

    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
    ) {
        this.attackResolutionManager = new AttackResolutionManager(this.state);
    }

    update() {
        let damagedInternals = false;
        for (const damage of this.spaceManager.resolveObjectDamage(this.spaceObject.id)) {
            if (isWeaponDamageType(damage.damageType)) {
                damagedInternals =
                    this.takeWeaponDamage({
                        ...damage,
                        damageType: damage.damageType,
                        profile: damageProfiles[damage.damageType],
                    }) || damagedInternals;
            } else {
                damagedInternals = this.takeCollisionDamage(damage) || damagedInternals;
            }
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

    public takeWeaponDamage(damage: AttackDamage): boolean {
        const resolution = this.attackResolutionManager.resolveAttack(damage);
        const damagedExternals = this.applySurfaceChannelDamage(damage, resolution.surfaceChannel);
        return this.applyExposedSystemDamage(damage, resolution.exposures) || damagedExternals;
    }

    public takeCollisionDamage(damage: Damage): boolean {
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

    /** applies the surface channel's pre-scaled amount to its systems as ordinary defect rolls */
    private applySurfaceChannelDamage(damage: AttackDamage, surfaceChannel: SurfaceChannelHit | null): boolean {
        if (!surfaceChannel) {
            return false;
        }
        const scaled = { id: damage.id, amount: surfaceChannel.amount };
        for (const system of surfaceChannel.systems) {
            this.damageSystem(system, scaled, 1);
        }
        return true;
    }

    /**
     * plateDamage governs plate erosion only — once exposed, systems take the round's own
     * damage. Electronics damage is ship-wide, applied once at the worst exposure across
     * areas; other scopes draw from the systems of each exposed area
     */
    private applyExposedSystemDamage(damage: AttackDamage, exposures: AreaExposure[]): boolean {
        const { profile } = damage;
        const scaled = { ...damage, amount: damage.amount * profile.systemDamageFactor };
        if (profile.systemScope === 'electronics') {
            const worstExposure = exposures.reduce((r, { exposure }) => Math.max(r, exposure), 0);
            if (worstExposure === 0) {
                return false;
            }
            const electronics = this.filterSystemsByProfile(this.state.systems(), profile);
            if (electronics.length === 0) {
                return false;
            }
            for (const system of electronics) {
                this.damageSystem(system, scaled, worstExposure);
            }
            return true;
        }
        const candidates = exposures.flatMap(({ hitArea, exposure }) =>
            this.filterSystemsByProfile(this.state.systemsByAreas(hitArea) || [], profile).map((system) => ({
                system,
                exposure,
            })),
        );
        if (candidates.length === 0) {
            return false;
        }
        if (profile.systemScope === 'single') {
            const idx = this.die.getRollInRange(`pickSystem:${damage.id}`, 0, candidates.length);
            const { system, exposure } = candidates[Math.floor(idx)];
            this.damageSystem(system, scaled, exposure);
        } else {
            for (const { system, exposure } of candidates) {
                this.damageSystem(system, scaled, exposure);
            }
        }
        return true;
    }

    private filterSystemsByProfile(systems: ShipSystem[], profile: DamageProfile): ShipSystem[] {
        if (profile.systemScope === 'electronics') {
            return systems.filter((s) => s.isElectronics);
        }
        return systems.filter((s) => s.isInternal === profile.hitsInternal);
    }

    damageAllSystems(damageObject: { id: string; amount: number }) {
        for (const system of this.state.systems()) {
            this.damageSystem(system, damageObject, 1);
        }
    }

    /**
     * Spec §4: defects spill over rather than saturating a single roll. The event's damage
     * is walked off in damage50-sized steps, each rolled independently (capped at 50% success),
     * so expected defects scale linearly with the amount instead of flattening past one damage50.
     */
    damageSystem(system: ShipSystem, damageObject: { id: string; amount: number }, percentageOfBrokenPlates: number) {
        const appIdx = this.applicationCounter++;
        const damage50 = system.design.damage50;
        let remaining = damageObject.amount * percentageOfBrokenPlates;
        if (damage50 <= 0) {
            // an unconfigured damage50 means this system isn't meant to take defects this way;
            // treat any hit as a guaranteed single defect rather than looping forever at p=Infinity
            if (remaining > 0 && !system.broken) {
                this.applyDefect(system, `defect:${damageObject.id}:${appIdx}:${system.name}:0`);
            }
            return;
        }
        let rollIdx = 0;
        while (remaining > 0 && !system.broken && rollIdx < MAX_SPILLOVER_ROLLS) {
            const p = Math.min(0.5, remaining / (2 * damage50));
            const defectId = `defect:${damageObject.id}:${appIdx}:${system.name}:${rollIdx}`;
            if (this.die.getSuccess(defectId, p)) {
                this.applyDefect(system, defectId);
            }
            remaining -= damage50;
            rollIdx++;
        }
    }

    private applyDefect(system: ShipSystem, defectId: string) {
        if (Thruster.isInstance(system)) {
            this.damageThruster(system, defectId);
        } else if (ChainGun.isInstance(system)) {
            this.damageChainGun(system, defectId);
        } else if (Radar.isInstance(system)) {
            this.damageRadar(system, defectId);
        } else if (SmartPilot.isInstance(system)) {
            this.damageSmartPilot(system);
        } else if (Reactor.isInstance(system)) {
            this.damageReactor(system, defectId);
        } else if (Magazine.isInstance(system)) {
            this.damageMagazine(system, defectId);
        } else if (Warp.isInstance(system)) {
            this.damageWarp(system, defectId);
        } else if (Docking.isInstance(system)) {
            this.damageDocking(system);
        } else if (Maneuvering.isInstance(system)) {
            this.damageManeuvering(system, defectId);
        } else if (Signals.isInstance(system)) {
            this.damageSignals(system, defectId);
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
            const idx = this.die.getRollInRange('magazineLostAmmo:' + damageId, 0, ammoTypes.length);
            const projectileKey = ammoTypes[Math.floor(idx)];
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

    private damageRadar(radar: Radar, damageId: string) {
        if (radar.design.turnSpeed <= 0 || this.die.getSuccess('damageRadarRange:' + damageId, 0.5)) {
            radar.malfunctionRangeFactor += 0.05;
        } else {
            radar.turnSpeedFactor *= 0.9;
        }
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
