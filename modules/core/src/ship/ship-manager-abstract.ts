import { Bot, jouster, p2pGoto } from '../logic/bot';
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
    TargetedStatus,
    capToRange,
    lerp,
    projectileModels,
} from '..';
import { ChainGunManager, resetChainGun } from './chain-gun-manager';

import { Armor } from './armor';
import { DamageManager } from './damage-manager';
import { DeepReadonly } from 'ts-essentials';
import { DockingManager } from './docking-manager';
import { Iterator } from '../logic/iteration';
import { Magazine } from './magazine';
import { Maneuvering } from './maneuvering';
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
    state.maneuvering.afterBurnerFuel = state.maneuvering.design.maxAfterBurnerFuel;
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
export type ShipSystem = ChainGun | Thruster | Radar | SmartPilot | Reactor | Magazine | Warp | Docking | Maneuvering;
export type Die = {
    getRoll: (id: string) => number;
    getSuccess: (id: string, successProbability: number) => boolean;
    getRollInRange: (id: string, min: number, max: number) => number;
};

export interface EnergySource {
    trySpendEnergy(value: number, system?: ShipSystem): boolean;
}
export abstract class ShipManager {
    protected readonly internalProxy = {
        trySpendEnergy: (_: number, _2?: ShipSystem) => false,
    };
    public bot: Bot | null = null;
    public weaponsTarget: SpaceObject | null = null;

    public totalSeconds = 0;
    protected tubeManagers = new Array<ChainGunManager>();
    protected chainGunManager: ChainGunManager | null = null;
    protected dockingManager: DockingManager;
    protected damageManager: DamageManager;

    constructor(
        public readonly spaceObject: DeepReadonly<Spaceship>,
        public state: ShipState,
        protected spaceManager: SpaceManager,
        public die: Die,
        protected ships?: Map<string, ShipManager>,
    ) {
        resetShipState(this.state);

        this.damageManager = new DamageManager(this.spaceObject, this.state, this.spaceManager, this.die);

        this.dockingManager = new DockingManager(
            this.spaceObject,
            this.state,
            this.spaceManager,
            this,
            this.damageManager,
        );
        if (this.state.chainGun) {
            this.chainGunManager = new ChainGunManager(
                this.state.chainGun,
                this.spaceObject,
                this.state,
                this.spaceManager,
                this,
                this.internalProxy,
            );
        }
        for (const tube of this.state.tubes) {
            this.tubeManagers.push(
                new ChainGunManager(tube, this.spaceObject, this.state, this.spaceManager, this, this.internalProxy),
            );
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
            result = result.filter((v) => v.faction !== Faction.NONE && v.faction !== this.state.faction);
        }
        const visibleObjects = this.spaceManager.getFactionVisibleObjects(this.state.faction);
        return result.filter((v) => visibleObjects.has(v)).map((s) => s.id);
    }

    protected update(deltaSeconds: number) {
        this.totalSeconds += deltaSeconds;
        // sync relevant ship props, before any other calculation
        this.syncShipProperties();
        this.healPlates(deltaSeconds);
        this.damageManager.update();
        this.bot?.update(deltaSeconds, this.spaceManager.state, this);
        this.applyBotOrders();
        this.validateWeaponsTargetId();
        this.chainGunManager?.update(deltaSeconds);
        for (const tubeManager of this.tubeManagers) {
            tubeManager.update(deltaSeconds);
        }
        // this.movementManager.update(deltaSeconds);
        this.handleTargetCommands();
        this.calcTargetedStatus();

        this.updateRadarRange(deltaSeconds);
        this.updateAmmo();
        this.dockingManager.update();
    }

    private applyBotOrders() {
        const order = this.spaceManager.resolveObjectOrder(this.spaceObject.id);
        if (order) {
            this.bot?.cleanup(this);
            if (order.type === 'move') {
                this.bot = p2pGoto(order.position);
            } else if (order.type === 'attack') {
                this.bot = jouster(order.targetId);
            }
        }
    }

    protected updateRadarRange(deltaSeconds: number) {
        const range = this.calcRadarRange();
        if (
            this.internalProxy.trySpendEnergy(
                range * (this.state.radar.design.energyCost / 1000) * deltaSeconds,
                this.state.radar,
            )
        ) {
            this.spaceManager.changeShipRadarRange(this.spaceObject.id, this.calcRadarRange());
        }
        this.state.radarRange = this.spaceObject.radarRange;
    }

    private calcRadarRange() {
        if (this.state.radar.malfunctionRangeFactor && this.state.radar.effectiveness) {
            const frequency = this.die.getRollInRange('updateRadarRangeFrequency', 0.2, 1);
            const wave = sinWave(this.totalSeconds, frequency, 0.5, 0, 0.5);
            const factorEaseRange = [
                this.state.radar.malfunctionRangeFactor,
                this.state.radar.malfunctionRangeFactor + this.state.radar.design.rangeEaseFactor,
            ] as const;
            const cappedWave = capToRange(...factorEaseRange, wave);
            return (
                lerp(
                    factorEaseRange,
                    [this.state.radar.design.malfunctionRange, this.state.radar.design.range],
                    cappedWave,
                ) * this.state.radar.effectiveness
            );
        } else {
            return this.state.radar.design.range * this.state.radar.effectiveness;
        }
    }

    protected healPlates(deltaSeconds: number) {
        for (const plate of this.state.armor.armorPlates) {
            if (plate.health > 0 && plate.health < this.state.armor.design.plateMaxHealth) {
                plate.health = Math.min(
                    plate.health + this.state.armor.design.healRate * deltaSeconds,
                    this.state.armor.design.plateMaxHealth,
                );
            }
        }
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
            if (!this.weaponsTarget) {
                this.state.weaponsTarget.targetId = null;
            }
        } else {
            this.weaponsTarget = null;
        }
        this.setShellRangeMode(this.weaponsTarget ? SmartPilotMode.TARGET : SmartPilotMode.DIRECT);
    }

    protected syncShipProperties() {
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

    protected updateAmmo() {
        for (const projectileKey of projectileModels) {
            this.state.magazine[`count_${projectileKey}`] = Math.min(
                this.state.magazine[`count_${projectileKey}`],
                this.state.magazine[`max_${projectileKey}`],
            );
        }
    }
}
