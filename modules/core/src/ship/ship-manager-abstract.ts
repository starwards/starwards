import {
    ChainGun,
    Docking,
    Faction,
    Order,
    Radar,
    RadarSectorValues,
    Reactor,
    ShipState,
    SmartPilot,
    SmartPilotMode,
    SpaceObject,
    Spaceship,
    TargetedStatus,
    ammoTypes,
    applyRadarSectors,
    sampleRadarAreaFactor,
    toPositiveDegreesDelta,
} from '..';
import { ChainGunManager, resetChainGun } from './chain-gun-manager';
import { IterationData, Updateable } from '../updateable';
import { Turret, updateTurret } from './turret';

import { AmmoManager } from './ammo-manager';
import { Armor } from './armor';
import { AutomationManager } from './automation-manager';
import { DamageManager } from './damage-manager';
import { DeepReadonly } from 'ts-essentials';
import { DockingManager } from './docking-manager';
import { HeatManager } from './heat-manager';
import { Iterator } from '../logic/iteration';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
import { ReactorCellManager } from './reactor-cell-manager';
import { Signals } from './signals';
import { SignalsJobManager } from './signals-job-manager';
import { SpaceManager } from '../logic/space-manager';
import { Thruster } from './thruster';
import { Tube } from './tube';
import { Warp } from './warp';
import { applyLockCommands } from '../lock-commands';
import { createLogger } from '../logger';
import { revertOperationSideEffects } from './repair-manager';

const { error: logError } = createLogger('ship-manager');

/**
 * How long a weapons lock may go unconfirmed by line-of-sight (a missed shot's explosion
 * drifting across the bearing, any other momentary occluder) before it's treated as a genuine
 * loss and dropped. Chosen to comfortably outlast a single blast's `secondsToLive` while still
 * dropping promptly once the target is actually gone — not validated against real playtest
 * numbers, same caveat as `ENERGY_STARVATION_GRACE_SECONDS` in `repair-manager.ts`.
 */
export const TARGET_OCCLUSION_GRACE_SECONDS = 1.5;

function fixArmor(armor: Armor) {
    for (const plate of armor.armorPlates) {
        for (const layer of plate.layers) {
            layer.health = layer.maxHealth;
        }
    }
}

export function resetShipState(state: ShipState) {
    state.reactor.energy = state.reactor.design.maxEnergy;
    state.reactor.energyCells = state.reactor.design.maxEnergyCells;
    state.maneuvering.afterBurnerFuel = state.maneuvering.design.maxAfterBurnerFuel;
    fixArmor(state.armor);
    for (const chainGun of state.chainGuns) {
        resetChainGun(chainGun);
    }
    for (const thruster of state.thrusters) {
        resetThruster(thruster);
    }
    for (const radar of state.radars) {
        radar.malfunctionRangeFactor = 0;
    }
    state.smartPilot.offsetFactor = 0;
    state.signals.jobs.splice(0);
    // an operation left ACTIVE across this reset (e.g. NPC<->PC conversion) has no RepairManager
    // left to revert its side effects later — do it here or the affected system's power stays
    // pinned at 0 forever (see SavedPowerEntry / revertOperationSideEffects).
    for (const op of state.repairQueue.operations) {
        revertOperationSideEffects(state, op);
    }
    state.repairQueue.operations.splice(0);
    state.repairQueue.recentlyFinished.splice(0);
    state.repairQueue.refusalReason = '';
    state.repairQueue.refusalSecondsRemaining = 0;
    for (const at of ammoTypes) {
        state.magazine.setCount(at, state.magazine.getMax(at));
    }
    // Reset non-@gameField command properties that Schema.clone() does not copy.
    // Without this, cloned states have these as undefined, causing NaN propagation.
    state.afterBurnerCommand = 0;
    state.rotationModeCommand = false;
    state.maneuveringModeCommand = false;
    state.fireTubesCommand = false;
    state.hullDamaged = false;
    state.repairQueue.enqueueCommands = [];
    state.repairQueue.cancelCommands = [];
    state.repairQueue.reorderCommands = [];
    state.lockCommands = [];
    // Clear automation orders and task (prevents stale state after NPC→PC conversion)
    state.order = Order.NONE;
    state.orderTargetId = null;
    state.orderPosition.x = 0;
    state.orderPosition.y = 0;
    state.currentTask = '';
    state.smartPilot.maneuvering.x = 0;
    state.smartPilot.maneuvering.y = 0;
    state.smartPilot.rotation = 0;
    state.smartPilot.rotationTargetOffset = 0;
    state.smartPilot.maneuveringMode = SmartPilotMode.DIRECT;
    state.smartPilot.rotationMode = SmartPilotMode.DIRECT;
}

function resetThruster(thruster: Thruster) {
    thruster.bearingSkew = 0;
    thruster.availableCapacity = 1.0;
}
export type ShipSystem =
    ChainGun | Thruster | Radar | SmartPilot | Reactor | Magazine | Warp | Docking | Maneuvering | Signals;

export type Die = {
    getRoll: (id: string) => number;
    getSuccess: (id: string, successProbability: number) => boolean;
    getRollInRange: (id: string, min: number, max: number) => number;
    getDrift: (id: string, frequencyHz?: number) => number;
    getDriftInRange: (id: string, min: number, max: number, frequencyHz?: number) => number;
    getGaussian: (id: string, mean: number, stdev: number) => number;
};

export interface EnergySource {
    trySpendEnergy(value: number, system?: ShipSystem): boolean;
}
export interface HeatSink {
    addHeat(value: number, system: ShipSystem): void;
}
export abstract class ShipManager implements Updateable {
    protected readonly internalProxy = {
        trySpendEnergy: (_: number, _2?: ShipSystem) => false,
        addHeat: (_: number, _2: ShipSystem) => undefined as void,
    };
    public weaponsTarget: SpaceObject | null = null;
    /** Seconds the current weapons target has been continuously out of line-of-sight. */
    private targetOccludedSeconds = 0;

    protected tubeManagers = new Array<ChainGunManager>();
    protected chainGunManagers = new Array<ChainGunManager>();
    protected dockingManager: DockingManager;
    /**
     * Public so tests can reach heat-management hooks (`setHeatManagementEnabled`, `isCeasefireLatched`)
     * — a test-only hatch, not a supported API. Non-test code should not depend on this being public.
     */
    public automationManager: AutomationManager;
    protected damageManager: DamageManager;
    protected heatManager: HeatManager;
    protected ammoManager: AmmoManager;
    protected reactorCellManager: ReactorCellManager;
    public signalsJobManager: SignalsJobManager;

    constructor(
        public readonly spaceObject: DeepReadonly<Spaceship>,
        public state: ShipState,
        protected spaceManager: SpaceManager,
        public die: Die,
        protected ships?: Map<string, ShipManager>,
    ) {
        resetShipState(this.state);

        this.damageManager = new DamageManager(this.spaceObject, this.state, this.spaceManager, this.die);
        this.heatManager = new HeatManager(this.state, this.damageManager);
        this.internalProxy.addHeat = this.heatManager.addHeat.bind(this.heatManager);
        this.dockingManager = new DockingManager(this.state, this.spaceManager, this.damageManager);
        this.automationManager = new AutomationManager(this.state, this, this.spaceManager);
        this.ammoManager = new AmmoManager(this.state);
        this.reactorCellManager = new ReactorCellManager(this.state);
        this.signalsJobManager = new SignalsJobManager(this.state, this.spaceManager);
        for (const [index, chainGun] of this.state.chainGuns.entries()) {
            this.chainGunManagers.push(
                new ChainGunManager(
                    chainGun,
                    this.spaceObject,
                    this.state,
                    this.spaceManager,
                    this,
                    this.internalProxy,
                    this.internalProxy,
                    this.die,
                    `chainGun:${index}`,
                ),
            );
        }
        for (const [index, tube] of this.state.tubes.entries()) {
            this.tubeManagers.push(
                new ChainGunManager(
                    tube,
                    this.spaceObject,
                    this.state,
                    this.spaceManager,
                    this,
                    this.internalProxy,
                    this.internalProxy,
                    this.die,
                    `tube:${index}`,
                ),
            );
        }
    }

    public cancelAllTasks() {
        this.dockingManager.cancelTask();
        this.automationManager.cancelTask();
    }

    public setSmartPilotManeuveringMode(value: SmartPilotMode) {
        if (value === SmartPilotMode.TARGET && !this.weaponsTarget) {
            logError(new Error(`attempt to set smartPilot.maneuveringMode to TARGET with no target`));
        } else {
            if (value !== this.state.smartPilot.maneuveringMode) {
                this.state.smartPilot.maneuveringMode = value;
                this.state.smartPilot.maneuvering.x = 0;
                this.state.smartPilot.maneuvering.y = 0;
            }
        }
    }

    public setSmartPilotRotationMode(value: SmartPilotMode) {
        if (value === SmartPilotMode.TARGET && !this.weaponsTarget) {
            logError(new Error(`attempt to set smartPilot.rotationMode to TARGET with no target`));
        } else {
            if (value !== this.state.smartPilot.rotationMode) {
                this.state.smartPilot.rotationMode = value;
                this.state.smartPilot.rotation = 0;
                this.state.smartPilot.rotationTargetOffset = 0;
            }
        }
    }

    public setShellRangeMode(value: SmartPilotMode) {
        for (const chainGunManager of this.chainGunManagers) {
            chainGunManager.setShellRangeMode(value);
        }
    }

    public setTarget(id: string | null) {
        this.state.weaponsTarget.targetId = id;
        this.targetOccludedSeconds = 0;
        this.validateWeaponsTargetId();
        if (this.weaponsTarget && !this.spaceManager.isVisible(this.spaceObject.id, this.weaponsTarget.id)) {
            // a freshly assigned target must be visible right now — the occlusion grace period
            // only covers a lock already held, not initial acquisition
            this.state.weaponsTarget.targetId = null;
            this.validateWeaponsTargetId();
        }
    }

    public handleTargetCommands() {
        if (this.state.weaponsTarget.clearTargetCommand) {
            this.state.weaponsTarget.clearTargetCommand = false;
            this.setTarget(null);
        }
        if (this.state.weaponsTarget.nextTargetCommand) {
            this.state.weaponsTarget.nextTargetCommand = false;
            this.setTarget(this.getViableTargetIds().elementAfter(this.state.weaponsTarget.targetId));
        }
        if (this.state.weaponsTarget.prevTargetCommand) {
            this.state.weaponsTarget.prevTargetCommand = false;
            this.setTarget(this.getViableTargetIds().elementBefore(this.state.weaponsTarget.targetId));
        }
    }

    private getViableTargetIds(): Iterator<string | null> {
        const iterable: Iterable<SpaceObject> = this.state.weaponsTarget.shipOnly
            ? this.spaceManager.state.getAll('Spaceship')
            : this.spaceManager.state;
        let result = new Iterator(iterable).filter((v) => v.id !== this.state.id && v.isCorporal);
        if (this.state.weaponsTarget.enemyOnly) {
            result = result.filter((v) => v.faction !== Faction.NONE && v.faction !== this.state.faction);
        }
        const visibleObjects = this.spaceManager.getFactionVisibleObjects(this.state.faction);
        return result.filter((v) => visibleObjects.has(v)).map((s) => s.id);
    }

    update(id: IterationData) {
        // apply GM lock/unlock commands before anything else can write a locked field this tick
        applyLockCommands(this.state);
        // sync relevant ship props, before any other calculation
        this.syncShipProperties();
        this.damageManager.update();
        this.heatManager.update(id);
        this.automationManager.update(id);

        // mounts swing before anything reads where they point
        this.updateTurrets(id);
        // vision first: the target and signal gates below all read this tick's radar sectors
        this.updateRadarSectors(id);
        this.validateWeaponsTargetId(id.deltaSeconds);
        const firingTubes = this.consumeFireTubesCommand();
        for (const chainGunManager of this.chainGunManagers) {
            chainGunManager.update(id);
        }
        for (const tubeManager of this.tubeManagers) {
            tubeManager.update(id);
        }
        this.lockFiredTubes(firingTubes);
        this.handleTargetCommands();
        this.calcTargetedStatus();

        this.signalsJobManager.update(id);
        this.ammoManager.update(id);
        this.reactorCellManager.update(id);
        this.updateAmmo();
        this.dockingManager.update();
    }

    /**
     * Ship-level fire: marks every unlocked, ready tube as firing for this tick. Readiness itself
     * is still gated by ChainGunManager.fireChainGun(); this only decides which tubes fire.
     */
    private consumeFireTubesCommand(): Tube[] {
        if (!this.state.fireTubesCommand) {
            return [];
        }
        this.state.fireTubesCommand = false;
        const readyTubes = this.state.tubes.filter(
            (tube) =>
                !tube.safetyLocked && tube.effectiveness > 0 && tube.loading >= 1 && tube.loadedProjectile !== 'None',
        );
        for (const tube of readyTubes) {
            tube.isFiring = true;
        }
        return readyTubes;
    }

    /** Every tube that fired this tick re-locks immediately, per the ship-level fire design. */
    private lockFiredTubes(firedTubes: Tube[]) {
        for (const tube of firedTubes) {
            tube.isFiring = false;
            tube.safetyLocked = true;
        }
    }

    /**
     * Swings every system carried on a mount toward the bearing its crew asked for. Systems that
     * are bolted in place have a `turnSpeed` of 0 and stay where they were fitted.
     */
    protected updateTurrets({ deltaSeconds }: IterationData) {
        for (const system of this.state.systems()) {
            if (system instanceof Turret) {
                updateTurret(system, deltaSeconds);
            }
        }
    }

    /**
     * Every radar contributes one vision sector to the ship's field of view. Each tick we charge
     * each radar its energy, refresh its malfunction easing, and mirror the resulting geometry
     * onto the space object so both the server and every client see the same union.
     */
    protected updateRadarSectors({ deltaSeconds }: IterationData) {
        const sectors: RadarSectorValues[] = [];
        for (const [index, radar] of this.state.radars.entries()) {
            radar.powered = this.internalProxy.trySpendEnergy(
                radar.design.range * radar.effectiveness * (radar.design.energyCost / 1000) * deltaSeconds,
                radar,
            );
            radar.areaFactor = radar.powered ? this.calcRadarAreaFactor(radar, index) : 0;
            sectors.push({
                direction: toPositiveDegreesDelta(radar.getGlobalBearing(this.state)),
                arc: radar.arc,
                range: radar.range,
            });
        }
        this.spaceManager.changeShipRadarSectors(this.spaceObject.id, sectors);
    }

    /**
     * `areaFactor` for a malfunctioning radar wanders via smooth, non-periodic value noise
     * rather than a fixed sine — a struggling radar should not pulse on a predictable beat. See
     * `sampleRadarAreaFactor` for the noise construction; the key carries ship id + radar index so
     * radars never fluctuate in lockstep, on one hull or across ships.
     */
    private calcRadarAreaFactor(radar: Radar, index: number) {
        return sampleRadarAreaFactor(
            this.die,
            `radarMalfunction:${this.spaceObject.id}:${index}`,
            radar.malfunctionRangeFactor,
            radar.design.rangeEaseFactor,
        );
    }

    protected calcTargetedStatus() {
        let status = TargetedStatus.NONE; // default state
        if (this.ships) {
            for (const shipManager of this.ships.values()) {
                if (shipManager.state.weaponsTarget.targetId === this.state.id) {
                    if (shipManager.state.chainGuns.some((chainGun) => chainGun.isFiring)) {
                        status = TargetedStatus.FIRED_UPON;
                        break; // no need to look further
                    }
                    if (status === TargetedStatus.NONE) {
                        status = TargetedStatus.LOCKED;
                    }
                }
            }
        }
        this.state.targeted = status;
    }

    protected validateWeaponsTargetId(deltaSeconds = 0) {
        if (typeof this.state.weaponsTarget.targetId === 'string') {
            this.weaponsTarget = this.spaceManager.state.get(this.state.weaponsTarget.targetId) || null;
            if (this.weaponsTarget && !this.weaponsTarget.isCorporal) {
                this.weaponsTarget = null;
            }
            if (!this.weaponsTarget) {
                this.state.weaponsTarget.targetId = null;
                this.targetOccludedSeconds = 0;
            } else if (this.spaceManager.isVisible(this.spaceObject.id, this.state.weaponsTarget.targetId)) {
                this.targetOccludedSeconds = 0;
            } else {
                // brief occlusion (an explosion, another hull drifting across the bearing) doesn't
                // drop the lock outright — only a sustained loss past the grace window does
                this.targetOccludedSeconds += deltaSeconds;
                if (this.targetOccludedSeconds > TARGET_OCCLUSION_GRACE_SECONDS) {
                    this.weaponsTarget = null;
                    this.state.weaponsTarget.targetId = null;
                    this.targetOccludedSeconds = 0;
                }
            }
        } else {
            this.weaponsTarget = null;
            this.targetOccludedSeconds = 0;
        }
        this.setShellRangeMode(this.weaponsTarget ? SmartPilotMode.TARGET : SmartPilotMode.DIRECT);
    }

    protected syncShipProperties() {
        this.state.spaceship.position.x = this.spaceObject.position.x;
        this.state.spaceship.position.y = this.spaceObject.position.y;
        this.state.spaceship.velocity.x = this.spaceObject.velocity.x;
        this.state.spaceship.velocity.y = this.spaceObject.velocity.y;
        this.state.spaceship.turnSpeed = this.spaceObject.turnSpeed;
        this.state.spaceship.angle = this.spaceObject.angle;
        this.state.spaceship.faction = this.spaceObject.faction;
        this.state.spaceship.radius = this.spaceObject.radius;
        applyRadarSectors(this.state.spaceship.radarSectors, [...this.spaceObject.radarSectors]);
    }

    protected updateAmmo() {
        for (const at of ammoTypes) {
            this.state.magazine[`count_${at}`] = Math.min(
                this.state.magazine[`count_${at}`],
                this.state.magazine[`max_${at}`],
            );
        }
    }
}
