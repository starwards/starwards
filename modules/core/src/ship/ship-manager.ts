import { Bot, cleanupBot, jouster, p2pGoto } from '../logic/bot';
import {
    ChainGun,
    Docking,
    Faction,
    Radar,
    Reactor,
    ShipState,
    SmartPilot,
    SmartPilotMode,
    SpaceObject,
    Spaceship,
    StatesToggle,
    TargetedStatus,
    capToRange,
    lerp,
    projectileModels,
    rotateToTarget,
    rotationFromTargetTurnSpeed,
} from '..';
import { ChainGunManager, resetChainGun } from './chain-gun-manager';

import { Armor } from './armor';
import { DamageManager } from './damage-manager';
import { DeepReadonly } from 'ts-essentials';
import { DockingManager } from './docking-manager';
import { EnergyManager } from './energy-manager';
import { HeatManager } from './heat-manager';
import { Iterator } from '../logic/iteration';
import { Magazine } from './magazine';
import { MovementManager } from './movement-manager';
import { SpaceManager } from '../logic/space-manager';
import { Thruster } from './thruster';
import { Warp } from './warp';
import { sinWave } from '../logic';

function fixArmor(armor: Armor) {
    const plateMaxHealth = armor.design.plateMaxHealth;
    for (const plate of armor.armorPlates) {
        plate.health = plateMaxHealth;
    }
}

export function resetShipState(state: ShipState) {
    state.reactor.energy = state.reactor.design.maxEnergy;
    state.reactor.afterBurnerFuel = state.reactor.design.maxAfterBurnerFuel;
    fixArmor(state.armor);
    if (state.chainGun) {
        resetChainGun(state.chainGun);
    }
    for (const thruster of state.thrusters) {
        resetThruster(thruster);
    }
    state.smartPilot.offsetFactor = 0;
    state.magazine.count_CannonShell = state.magazine.max_CannonShell;
}

function resetThruster(thruster: Thruster) {
    thruster.angleError = 0;
    thruster.availableCapacity = 1.0;
}
export type ShipSystem = ChainGun | Thruster | Radar | SmartPilot | Reactor | Magazine | Warp | Docking;
export type Die = {
    getRoll: (id: string) => number;
    getSuccess: (id: string, successProbability: number) => boolean;
    getRollInRange: (id: string, min: number, max: number) => number;
};
export class ShipManager {
    public bot: Bot | null = null;
    public weaponsTarget: SpaceObject | null = null;
    private smartPilotManeuveringMode: StatesToggle<SmartPilotMode>;
    private smartPilotRotationMode: StatesToggle<SmartPilotMode>;

    private totalSeconds = 0;
    private tubeManagers = new Array<ChainGunManager>();
    private chainGunManager: ChainGunManager | null = null;
    private movementManager: MovementManager;
    private dockingManager: DockingManager;
    private energyManager: EnergyManager;
    private heatManager: HeatManager;
    private damageManager: DamageManager;

    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        public state: ShipState,
        private spaceManager: SpaceManager,
        public die: Die,
        private ships?: Map<string, ShipManager>
    ) {
        this.smartPilotManeuveringMode = new StatesToggle<SmartPilotMode>(
            (s) => this.setSmartPilotManeuveringMode(s),
            SmartPilotMode.VELOCITY,
            SmartPilotMode.TARGET,
            SmartPilotMode.DIRECT
        );
        this.smartPilotRotationMode = new StatesToggle<SmartPilotMode>(
            (s) => this.setSmartPilotRotationMode(s),
            SmartPilotMode.VELOCITY,
            SmartPilotMode.TARGET
        );
        resetShipState(this.state);
        if (this.state.chainGun) {
            this.chainGunManager = new ChainGunManager(
                this.state.chainGun,
                this.spaceObject,
                this.state,
                this.spaceManager,
                this
            );
        }
        this.damageManager = new DamageManager(this.spaceObject, this.state, this.spaceManager, this.die);
        this.heatManager = new HeatManager(this.state, this.damageManager);
        this.energyManager = new EnergyManager(this.state, this.heatManager);
        this.movementManager = new MovementManager(
            this.spaceObject,
            this.state,
            this.spaceManager,
            this,
            this.damageManager,
            this.energyManager,
            this.die
        );
        this.dockingManager = new DockingManager(this.spaceObject, this.state, this.spaceManager, this);
        for (const tube of this.state.tubes) {
            this.tubeManagers.push(new ChainGunManager(tube, this.spaceObject, this.state, this.spaceManager, this));
        }
    }

    public setSmartPilotManeuveringMode(value: SmartPilotMode) {
        if (value === SmartPilotMode.TARGET && !this.weaponsTarget) {
            // eslint-disable-next-line no-console
            console.error(new Error(`attempt to set smartPilot.maneuveringMode to TARGET with no target`));
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
            // eslint-disable-next-line no-console
            console.error(new Error(`attempt to set smartPilot.rotationMode to TARGET with no target`));
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
        let result = new Iterator(iterable).filter((v) => v.id !== this.state.id);
        if (this.state.weaponsTarget.enemyOnly) {
            result = result.filter((v) => v.faction !== Faction.none && v.faction !== this.state.faction);
        }
        const visibleObjects = this.spaceManager.getFactionVisibleObjects(this.state.faction);
        return result.filter((v) => visibleObjects.has(v)).map((s) => s.id);
    }

    public handleToggleSmartPilotManeuveringMode() {
        if (this.state.maneuveringModeCommand) {
            this.state.maneuveringModeCommand = false;
            this.smartPilotManeuveringMode.toggleState();
        }
    }

    public handleToggleSmartPilotRotationMode() {
        if (this.state.rotationModeCommand) {
            this.state.rotationModeCommand = false;
            this.smartPilotRotationMode.toggleState();
        }
    }

    update(deltaSeconds: number) {
        this.totalSeconds += deltaSeconds;
        // sync relevant ship props, before any other calculation
        this.syncShipProperties();
        this.heatManager.update(deltaSeconds);
        this.healPlates(deltaSeconds);
        this.damageManager.update();
        this.applyBotOrders();
        if (this.bot) {
            this.bot.update(deltaSeconds, this.spaceManager.state, this);
        }
        this.validateWeaponsTargetId();
        this.chainGunManager?.update(deltaSeconds);
        for (const tubeManager of this.tubeManagers) {
            tubeManager.update(deltaSeconds);
        }
        this.movementManager.update(deltaSeconds);
        this.handleTargetCommands();
        this.handleToggleSmartPilotRotationMode();
        this.handleToggleSmartPilotManeuveringMode();
        this.calcTargetedStatus();
        this.energyManager.update(deltaSeconds);

        this.calcSmartPilotRotation(deltaSeconds);

        this.updateRadarRange();
        this.updateChainGunAmmo();
        this.dockingManager.update();
    }

    private updateRadarRange() {
        this.spaceManager.changeShipRadarRange(this.spaceObject.id, this.calcRadarRange());
        this.state.radarRange = this.spaceObject.radarRange;
    }

    private calcRadarRange() {
        if (this.state.radar.malfunctionRangeFactor) {
            const frequency = this.die.getRollInRange('updateRadarRangeFrequency', 0.2, 1);
            const wave = sinWave(this.totalSeconds, frequency, 0.5, 0, 0.5);
            const factorEaseRange = [
                this.state.radar.malfunctionRangeFactor,
                this.state.radar.malfunctionRangeFactor + this.state.radar.design.rangeEaseFactor,
            ] as const;
            const cappedWave = capToRange(...factorEaseRange, wave);
            return lerp(
                factorEaseRange,
                [this.state.radar.design.malfunctionRange, this.state.radar.design.basicRange],
                cappedWave
            );
        } else {
            return this.state.radar.design.basicRange;
        }
    }

    private applyBotOrders() {
        const order = this.spaceManager.resolveObjectOrder(this.spaceObject.id);
        if (order) {
            cleanupBot(this);
            if (order.type === 'move') {
                this.bot = p2pGoto(order.position);
            } else if (order.type === 'attack') {
                this.bot = jouster(order.targetId);
            }
        }
    }

    private healPlates(deltaSeconds: number) {
        for (const plate of this.state.armor.armorPlates) {
            if (plate.health > 0 && plate.health < this.state.armor.design.plateMaxHealth) {
                plate.health = Math.min(
                    plate.health + this.state.armor.design.healRate * deltaSeconds,
                    this.state.armor.design.plateMaxHealth
                );
            }
        }
    }

    private calcSmartPilotRotation(deltaSeconds: number) {
        let rotationCommand: number | undefined = undefined;
        switch (this.state.smartPilot.rotationMode) {
            case SmartPilotMode.DIRECT:
                rotationCommand = this.state.smartPilot.rotation;
                break;
            case SmartPilotMode.TARGET: {
                if (this.weaponsTarget) {
                    this.state.smartPilot.rotationTargetOffset = capToRange(
                        -1,
                        1,
                        this.state.smartPilot.rotationTargetOffset +
                            (this.state.smartPilot.rotation *
                                deltaSeconds *
                                this.state.smartPilot.design.aimOffsetSpeed) /
                                this.state.smartPilot.design.maxTargetAimOffset
                    );
                    rotationCommand = rotateToTarget(
                        deltaSeconds,
                        this.state,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.weaponsTarget.position,
                        this.state.smartPilot.rotationTargetOffset * this.state.smartPilot.design.maxTargetAimOffset
                    );
                } else {
                    rotationCommand = 0;
                }
                break;
            }
            case SmartPilotMode.VELOCITY: {
                rotationCommand = rotationFromTargetTurnSpeed(
                    deltaSeconds,
                    this.state,
                    this.state.smartPilot.rotation * this.state.smartPilot.design.maxTurnSpeed
                );
                break;
            }
        }
        this.state.rotation = capToRange(-1, 1, rotationCommand);
    }
    private calcTargetedStatus() {
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

    private validateWeaponsTargetId() {
        if (typeof this.state.weaponsTarget.targetId === 'string') {
            this.weaponsTarget = this.spaceManager.state.get(this.state.weaponsTarget.targetId) || null;
            if (!this.weaponsTarget) {
                this.state.weaponsTarget.targetId = null;
            }
        } else {
            this.weaponsTarget = null;
        }
        this.smartPilotManeuveringMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
        this.smartPilotRotationMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
        this.setShellRangeMode(this.weaponsTarget ? SmartPilotMode.TARGET : SmartPilotMode.DIRECT);
    }

    private syncShipProperties() {
        // only sync data that should be exposed to room clients
        this.state.position.x = this.spaceObject.position.x;
        this.state.position.y = this.spaceObject.position.y;
        this.state.velocity.x = this.spaceObject.velocity.x;
        this.state.velocity.y = this.spaceObject.velocity.y;
        this.state.turnSpeed = this.spaceObject.turnSpeed;
        this.state.angle = this.spaceObject.angle;
        this.state.faction = this.spaceObject.faction;
        this.state.radius = this.spaceObject.radius;
        this.state.radarRange = this.spaceObject.radarRange;
    }

    private updateChainGunAmmo() {
        for (const projectileKey of projectileModels) {
            this.state.magazine[`count_${projectileKey}`] = Math.min(
                this.state.magazine[`count_${projectileKey}`],
                this.state.magazine[`max_${projectileKey}`]
            );
        }
    }
}
