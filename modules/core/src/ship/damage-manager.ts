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
import { DamageProfile, WeaponDamageType, damageProfiles, isWeaponDamageType } from '../space/damage-profile';
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

/**
 * Explosion damage arrives per tick (damageFactor × dt × capped overlap), so this is
 * calibrated for sanding over a full cloud pass (a handful of small defects), not instant kills.
 */
const SURFACE_EFFECT_FACTOR = 0.05;

/**
 * bound on spillover rolls per application: past this point every roll sits at the 0.5 cap and
 * any real system breaks first, so extra iterations change nothing — but an absurd amount
 * (GM overrides, test fixtures) would otherwise grind amount/damage50 steps
 */
const MAX_SPILLOVER_ROLLS = 20;

export type AttackDamage = Damage & {
    damageType: WeaponDamageType;
    profile: DamageProfile;
};

type AreaExposure = { hitArea: ShipArea; exposure: number };

export class DamageManager {
    private applicationCounter = 0;

    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
    ) {}

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
        const armorResponse = this.state.armor.design.response(damage.damageType);
        const damagedExternals = this.applySurfaceEffect(damage);
        switch (armorResponse.kind) {
            case 'bypass': {
                const fullExposure = [...shipAreasInRange(damage.damageSurfaceArc)].map((hitArea) => ({
                    hitArea,
                    exposure: 1,
                }));
                this.applyExposedSystemDamage(damage, fullExposure);
                return true;
            }
            case 'block':
                return damagedExternals;
            case 'engage':
                return this.resolveArmorEngagement(damage, armorResponse) || damagedExternals;
        }
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

    /**
     * hull-mounted equipment sits outside every armor model — blast/shrapnel scrapes it
     * regardless of the plates, unless the armor deflects the round before the blast develops
     */
    private applySurfaceEffect(damage: AttackDamage): boolean {
        const { profile } = damage;
        if (!profile.surfaceEffect) {
            return false;
        }
        if (profile.deflectable && this.state.armor.design.deflectsSurfaceEffect) {
            return false;
        }
        const scaled = { ...damage, amount: damage.amount * SURFACE_EFFECT_FACTOR * profile.surfaceDamageFactor };
        for (const system of this.collectAreaSystems(damage.damageSurfaceArc)) {
            if (!system.isInternal) {
                this.damageSystem(system, scaled, 1);
            }
        }
        return true;
    }

    /**
     * systems take damage wherever a section is exposed — by broken plates or by
     * inherent penetration
     */
    private resolveArmorEngagement(damage: AttackDamage, armor: { plateFactor: number; penetration: number }): boolean {
        const exposures: AreaExposure[] = [];
        let cellPopped = false;
        for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {
            const areaArc = hitArea === ShipArea.front ? FRONT_ARC : REAR_ARC;
            const areaHitRangeAngles = archIntersection(areaArc, damage.damageSurfaceArc);
            if (!areaHitRangeAngles) {
                continue;
            }
            const engagement = this.engagePlatesInArea(
                damage.amount * armor.plateFactor,
                areaHitRangeAngles,
                !cellPopped,
            );
            cellPopped = engagement.cellPopped || cellPopped;
            const platesInArea = this.state.armor.numberOfPlatesInRange(areaArc);
            const brokenRatio = platesInArea > 0 ? engagement.brokenPlates / platesInArea : 0;
            const exposure = Math.max(armor.penetration, brokenRatio);
            if (exposure > 0) {
                exposures.push({ hitArea, exposure });
            }
        }
        const damagedInternals = this.applyExposedSystemDamage(damage, exposures);
        if (cellPopped && armor.penetration < 1) {
            // the popped cell consumes the blast/round — it must not keep dealing damage on
            // subsequent ticks or to other ships. A full-penetration round (tandem warhead)
            // survives the pop: the main charge lands.
            this.spaceManager.destroyObject(damage.id);
        }
        return damagedInternals;
    }

    /**
     * Ablative plates erode, and the hit leaks through whatever is bare after the erosion;
     * a reactive cell pops to defeat this hit, so only sections already bare before the pop
     * count as exposed. Intended: at most one cell per hit. Actual: one per damage tick —
     * a full-penetration explosion (Tandem) survives the pop and pops another cell each tick
     * it keeps dealing damage (see decision 011 item 3, known deviation).
     */
    private engagePlatesInArea(
        erosion: number,
        areaHitRangeAngles: RTuple2,
        mayPopCell: boolean,
    ): { brokenPlates: number; cellPopped: boolean } {
        if (this.state.armor.design.singleUsePlates) {
            const brokenPlates = this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles);
            const cellPopped = mayPopCell && this.consumeSingleUsePlate(areaHitRangeAngles);
            return { brokenPlates, cellPopped };
        }
        this.applyDamageToArmor(erosion, areaHitRangeAngles);
        return { brokenPlates: this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles), cellPopped: false };
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

    private collectAreaSystems(surfaceArc: RTuple2): ShipSystem[] {
        const collected: ShipSystem[] = [];
        for (const hitArea of shipAreasInRange(surfaceArc)) {
            collected.push(...(this.state.systemsByAreas(hitArea) || []));
        }
        return collected;
    }

    /** a single reactive cell sacrifices itself to defeat the whole hit */
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
            this.damageRadar(system);
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
