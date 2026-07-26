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
    malfunctionAreaFactor,
    toPositiveDegreesDelta,
} from '..';
import { ChainGunManager, resetChainGun } from './chain-gun-manager';
import { IterationData, Updateable } from '../updateable';
import { Turret, updateTurret } from './turret';

import { Armor } from './armor';
import { AutomationManager } from './automation-manager';
import { DamageManager } from './damage-manager';
import { DeepReadonly } from 'ts-essentials';
import { DockingManager } from './docking-manager';
import { HeatManager } from './heat-manager';
import { Iterator } from '../logic/iteration';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
import { Signals } from './signals';
import { SignalsJobManager } from './signals-job-manager';
import { SpaceManager } from '../logic/space-manager';
import { Thruster } from './thruster';
import { Warp } from './warp';
import { createLogger } from '../logger';
import { sinWave } from '../logic';

const { error: logError } = createLogger('ship-manager');

function fixArmor(armor: Armor) {
    for (const plate of armor.armorPlates) {
        for (const layer of plate.layers) {
            layer.health = layer.maxHealth;
        }
    }
}

export function resetShipState(state: ShipState) {
    state.reactor.energy = state.reactor.design.maxEnergy;
    state.maneuvering.afterBurnerFuel = state.maneuvering.design.maxAfterBurnerFuel;
    fixArmor(state.armor);
    if (state.chainGun) {
        resetChainGun(state.chainGun);
    }
    for (const thruster of state.thrusters) {
        resetThruster(thruster);
    }
    for (const radar of state.radars) {
        radar.malfunctionRangeFactor = 0;
    }
    state.smartPilot.offsetFactor = 0;
    state.signals.jobs.splice(0);
    for (const at of ammoTypes) {
        state.magazine.setCount(at, state.magazine.getMax(at));
    }
    // Reset non-@gameField command properties that Schema.clone() does not copy.
    // Without this, cloned states have these as undefined, causing NaN propagation.
    state.afterBurnerCommand = 0;
    state.rotationModeCommand = false;
    state.maneuveringModeCommand = false;
    state.hullDamaged = false;
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
    thruster.angleError = 0;
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

    protected tubeManagers = new Array<ChainGunManager>();
    protected chainGunManager: ChainGunManager | null = null;
    protected dockingManager: DockingManager;
    protected automationManager: AutomationManager;
    protected damageManager: DamageManager;
    protected heatManager: HeatManager;
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
        this.signalsJobManager = new SignalsJobManager(this.state, this.spaceManager, this.die, this.ships);
        if (this.state.chainGun) {
            this.chainGunManager = new ChainGunManager(
                this.state.chainGun,
                this.spaceObject,
                this.state,
                this.spaceManager,
                this,
                this.internalProxy,
                this.internalProxy,
            );
        }
        for (const tube of this.state.tubes) {
            this.tubeManagers.push(
                new ChainGunManager(
                    tube,
                    this.spaceObject,
                    this.state,
                    this.spaceManager,
                    this,
                    this.internalProxy,
                    this.internalProxy,
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
        this.chainGunManager?.setShellRangeMode(value);
    }

    public setTarget(id: string | null) {
        this.state.weaponsTarget.targetId = id;
        this.validateWeaponsTargetId();
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
        // sync relevant ship props, before any other calculation
        this.syncShipProperties();
        this.damageManager.update();
        this.heatManager.update(id);
        this.automationManager.update(id);

        // mounts swing before anything reads where they point
        this.updateTurrets(id);
        // vision first: the target and signal gates below all read this tick's radar sectors
        this.updateRadarSectors(id);
        this.validateWeaponsTargetId();
        this.chainGunManager?.update(id);
        for (const tubeManager of this.tubeManagers) {
            tubeManager.update(id);
        }
        this.handleTargetCommands();
        this.calcTargetedStatus();

        this.signalsJobManager.update(id);
        this.updateAmmo();
        this.dockingManager.update();
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
    protected updateRadarSectors({ totalSeconds, deltaSeconds }: IterationData) {
        const sectors: RadarSectorValues[] = [];
        for (const [index, radar] of this.state.radars.entries()) {
            radar.powered = this.internalProxy.trySpendEnergy(
                radar.design.range * radar.effectiveness * (radar.design.energyCost / 1000) * deltaSeconds,
                radar,
            );
            radar.areaFactor = radar.powered ? this.calcRadarAreaFactor(radar, index, totalSeconds) : 0;
            sectors.push({
                direction: toPositiveDegreesDelta(this.spaceObject.angle + radar.direction),
                arc: radar.arc,
                range: radar.range,
            });
        }
        this.spaceManager.changeShipRadarSectors(this.spaceObject.id, sectors);
    }

    private calcRadarAreaFactor(radar: Radar, index: number, totalSeconds: number) {
        if (!radar.malfunctionRangeFactor || !radar.effectiveness) {
            return 1;
        }
        const frequency = this.die.getDriftInRange(
            `updateRadarRangeFrequency:${this.spaceObject.id}:${index}`,
            0.2,
            1,
            0.15,
        );
        const wave = sinWave(totalSeconds, frequency, 0.5, 0, 0.5);
        return malfunctionAreaFactor(radar.malfunctionRangeFactor, radar.design.rangeEaseFactor, wave);
    }

    protected calcTargetedStatus() {
        let status = TargetedStatus.NONE; // default state
        if (this.ships) {
            for (const shipManager of this.ships.values()) {
                if (shipManager.state.weaponsTarget.targetId === this.state.id) {
                    if (shipManager.state.chainGun?.isFiring) {
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

    protected validateWeaponsTargetId() {
        if (typeof this.state.weaponsTarget.targetId === 'string') {
            this.weaponsTarget = this.spaceManager.state.get(this.state.weaponsTarget.targetId) || null;
            if (this.weaponsTarget && !this.weaponsTarget.isCorporal) {
                this.weaponsTarget = null;
            }
            if (!this.weaponsTarget) {
                this.state.weaponsTarget.targetId = null;
            } else {
                if (!this.spaceManager.isVisible(this.spaceObject.id, this.state.weaponsTarget.targetId)) {
                    this.weaponsTarget = null;
                    this.state.weaponsTarget.targetId = null;
                }
            }
        } else {
            this.weaponsTarget = null;
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
