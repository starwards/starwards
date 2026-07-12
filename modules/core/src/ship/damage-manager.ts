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
import { DamageProfile, DamageType, damageProfiles } from '../space/damage-profile';
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

// explosion delivery only (spec §4): a system accepts at most one damage-event application per
// this window. Rations a blast overlapping at 60 ticks/s from ~20 defects down to ~2-3 per
// engulfment. Impact needs no cooldown — one event per round, rate-limited by the weapon.
const DEFECT_COOLDOWN_SECONDS = 0.15;

export type AttackDamage = Damage & {
    damageType: DamageType;
    profile: DamageProfile;
};

type AreaExposure = { hitArea: ShipArea; exposure: number };

export class DamageManager {
    private gameTime = 0;
    // explosion-delivery defect cooldown: game time of the last damage-event application per system
    private readonly lastDefectTime = new WeakMap<ShipSystem, number>();

    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
    ) {}

    update(deltaSeconds = 0) {
        this.gameTime += deltaSeconds;
        let damagedInternals = false;
        for (const damage of this.spaceManager.resolveObjectDamage(this.spaceObject.id)) {
            if (damage.damageType === null) {
                damagedInternals = this.takeCollisionDamage(damage) || damagedInternals;
            } else {
                damagedInternals =
                    this.takeWeaponDamage({
                        ...damage,
                        damageType: damage.damageType,
                        profile: damageProfiles[damage.damageType],
                    }) || damagedInternals;
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
                // the armor is transparent to this type — every hit area is fully exposed
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

    // hull-mounted equipment sits outside every armor model — blast/shrapnel scrapes it
    // regardless of the plates, unless the armor deflects the round before the blast develops
    // (shrapnel clouds are not deflectable)
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
                this.applyDefectRolls(system, scaled, 1);
            }
        }
        return true;
    }

    // the armor engages: plates take the hit per area, then systems take damage wherever
    // a section is exposed — by broken plates or by inherent penetration
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
            // the popped reactive cell defeats the hit: the blast/round is consumed and stops
            // dealing damage on subsequent ticks and to other ships. A full-penetration round
            // (tandem warhead) pops the cell but is not consumed — the main charge lands.
            this.spaceManager.destroyObject(damage.id);
        }
        return damagedInternals;
    }

    // plate response to an engaging hit, one hit area at a time. Ablative plates erode, and
    // the hit leaks through whatever is bare after the erosion; a reactive cell (at most one
    // per hit) pops to defeat this hit, so only sections already bare before the pop count
    // as exposed
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

    // damage that got past the armor. plateDamage governs plate erosion only — once exposed,
    // systems take the round's own damage. Electronics damage is ship-wide, applied once at
    // the worst exposure across areas; other scopes draw from the systems of each exposed
    // area — 'single' defects one random system per hit, 'multi' defects every matching one
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
                this.applyDefectRolls(system, scaled, worstExposure);
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
            // sticky victim (spec §4): picked once per projectile, deterministically from its id.
            // every concentration roll from this projectile lands on this one system.
            const idx = this.die.getRollInRange(`pickSystem:${damage.id}`, 0, candidates.length);
            const { system, exposure } = candidates[Math.floor(idx)];
            this.applyDefectRolls(system, scaled, exposure);
        } else {
            for (const { system, exposure } of candidates) {
                this.applyDefectRolls(system, scaled, exposure);
            }
        }
        return true;
    }

    // one damage-event application to one system: concentration independent defect rolls, gated
    // (explosion delivery only) by the defect cooldown. If the system breaks mid-burst the
    // remaining rolls dissipate — damageSystem no-ops on a broken system.
    private applyDefectRolls(system: ShipSystem, damage: AttackDamage, exposure: number): void {
        if ((damage.delivery ?? 'explosion') === 'explosion') {
            const last = this.lastDefectTime.get(system);
            if (last !== undefined && this.gameTime - last < DEFECT_COOLDOWN_SECONDS) {
                return;
            }
            this.lastDefectTime.set(system, this.gameTime);
        }
        // mid-burst dissipation is free: damageSystem no-ops once the system breaks.
        // per-roll die key: N same-key rolls would hash identically (spec §4)
        for (let roll = 0; roll < (damage.concentration ?? 1); roll++) {
            this.damageSystem(system, damage, exposure, `${damage.id}:${roll}`);
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

    damageSystem(
        system: ShipSystem,
        damageObject: { id: string; amount: number },
        percentageOfBrokenPlates: number,
        dieId: string = damageObject.id,
    ) {
        if (system.broken) {
            return;
        }
        const dist = new NormalDistribution(system.design.damage50, system.design.damage50 / 2);
        const normalizedDamageProbability = dist.cdf(damageObject.amount * percentageOfBrokenPlates);
        if (this.die.getRoll('damageSystem:' + dieId) < normalizedDamageProbability) {
            if (Thruster.isInstance(system)) {
                this.damageThruster(system, dieId);
            } else if (ChainGun.isInstance(system)) {
                this.damageChainGun(system, dieId);
            } else if (Radar.isInstance(system)) {
                this.damageRadar(system);
            } else if (SmartPilot.isInstance(system)) {
                this.damageSmartPilot(system);
            } else if (Reactor.isInstance(system)) {
                this.damageReactor(system, dieId);
            } else if (Magazine.isInstance(system)) {
                this.damageMagazine(system, dieId);
            } else if (Warp.isInstance(system)) {
                this.damageWarp(system, dieId);
            } else if (Docking.isInstance(system)) {
                this.damageDocking(system);
            } else if (Maneuvering.isInstance(system)) {
                this.damageManeuvering(system, dieId);
            } else if (Signals.isInstance(system)) {
                this.damageSignals(system, dieId);
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
