import { AttackDamage, AttackResolutionManager, ResolvedSystemHit } from './attack-resolution-manager';
import { ChainGun, Damage, SmartPilot, SpaceManager, Spaceship, ammoTypes, capToRange, limitPercision } from '..';
import { Die, ShipSystem } from './ship-manager-abstract';
import { damageProfiles, isWeaponDamageType } from '../space/damage-profile';

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
 * bound on spillover rolls per application: past this point every roll sits at the 0.5 cap and
 * any real system breaks first, so extra iterations change nothing — but an absurd amount
 * (GM overrides, test fixtures) would otherwise grind amount/damage50 steps
 */
const MAX_SPILLOVER_ROLLS = 20;

export class DamageManager {
    private applicationCounter = 0;
    private attackResolution: AttackResolutionManager;

    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        private state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
    ) {
        this.attackResolution = new AttackResolutionManager(state, die);
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
                this.spaceManager.convertToDerelict(this.spaceObject.id);
            }
        }
    }

    public takeWeaponDamage(damage: AttackDamage): boolean {
        this.spaceManager.registerHit(damage.shipId);
        const { hits, damagedExternals, breachHit } = this.attackResolution.resolveWeaponAttack(damage);
        this.applyResolvedHits(hits);
        if (breachHit) {
            this.spaceManager.markBreachHit(damage.id);
        }
        return hits.length > 0 || damagedExternals;
    }

    public takeCollisionDamage(damage: Damage): boolean {
        const hits = this.attackResolution.resolveCollisionAttack(damage);
        this.applyResolvedHits(hits);
        return hits.length > 0;
    }

    private applyResolvedHits(hits: ResolvedSystemHit[]) {
        for (const hit of hits) {
            this.damageSystem(hit.system, hit.damage, hit.percentageOfBrokenPlates);
        }
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
        } else if (system instanceof ChainGun) {
            this.damageChainGun(system, defectId);
        } else if (Radar.isInstance(system)) {
            this.damageRadar(system, defectId);
        } else if (SmartPilot.isInstance(system)) {
            this.damageSmartPilot(system);
        } else if (Reactor.isInstance(system)) {
            this.damageReactor(system);
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

    private damageReactor(reactor: Reactor) {
        reactor.effeciencyFactor -= 0.1;
    }

    private damageSmartPilot(smartPilot: SmartPilot) {
        smartPilot.offsetFactor += 0.01;
    }

    /**
     * An omni radar has no skew surface and no traverse to lose (`design.maxBearingSkew` and
     * `design.turnSpeed` are both 0) — every hit routes to `malfunctionRangeFactor`, same as
     * today. A radar with a turn speed and/or a skew surface rolls across range plus whichever
     * of those surfaces its design actually declares — never writing to a surface the design says
     * does not exist (that field would be neither a visible defectible nor resettable by repair).
     * `damageRadarRange:` is kept as the seed id for the range branch — it is load-bearing for
     * existing determinism.
     */
    private damageRadar(radar: Radar, damageId: string) {
        const hasSkew = radar.design.maxBearingSkew > 0;
        const hasTraverse = radar.design.turnSpeed > 0;
        if (!hasSkew && !hasTraverse) {
            radar.malfunctionRangeFactor += 0.05;
            return;
        }
        if (this.die.getSuccess('damageRadarRange:' + damageId, 0.5)) {
            radar.malfunctionRangeFactor += 0.05;
            return;
        }
        const surfaces: Array<() => void> = [];
        if (hasTraverse) {
            surfaces.push(() => (radar.turnSpeedFactor *= 0.9));
        }
        if (hasSkew) {
            surfaces.push(
                () =>
                    (radar.bearingSkew +=
                        limitPercision(this.die.getRollInRange('damageRadarSkew:' + damageId, 1, 2)) *
                        (this.die.getSuccess('damageRadarSkewSign:' + damageId, 0.5) ? 1 : -1)),
            );
        }
        if (hasTraverse) {
            surfaces.push(() => (radar.bearingLimitFactor *= 0.9));
        }
        const roll = Math.floor(this.die.getRollInRange('damageRadarSurface:' + damageId, 0, surfaces.length));
        surfaces[Math.min(roll, surfaces.length - 1)]();
    }

    private damageThruster(thruster: Thruster, damageId: string) {
        if (this.die.getSuccess('damageThruster:' + damageId, 0.5)) {
            thruster.bearingSkew +=
                limitPercision(this.die.getRollInRange('thrusterAngleOffset:' + damageId, 1, 3)) *
                (this.die.getSuccess('thrusterAngleSign:' + damageId, 0.5) ? 1 : -1);
            thruster.bearingSkew = capToRange(-180, 180, thruster.bearingSkew);
        } else {
            thruster.availableCapacity = capToRange(
                0,
                1,
                thruster.availableCapacity -
                    limitPercision(this.die.getRollInRange('availableCapacity:' + damageId, 0.01, 0.1)),
            );
        }
    }

    private damageChainGun(chainGun: ChainGun, damageId: string) {
        if (this.die.getSuccess('damageChaingun:' + damageId, 0.5)) {
            chainGun.bearingSkew +=
                limitPercision(this.die.getRollInRange('chainGunAngleOffset:' + damageId, 1, 2)) *
                (this.die.getSuccess('chainGunAngleSign:' + damageId, 0.5) ? 1 : -1);
        } else {
            chainGun.rateOfFireFactor *= 0.9;
        }
    }
}
