import { Die, ShipManager } from './ship-manager-abstract';
import {
    NpcShipApi,
    PcShipApi,
    ShipState,
    SmartPilotMode,
    Spaceship,
    StatesToggle,
    XY,
    vector2ShipDirections,
} from '..';

import { DeepReadonly } from 'ts-essentials';
import { EnergyManager } from './energy-manager';
import { HeatManager } from './heat-manager';
import { IterationData } from '../updateable';
import { MovementManager } from './movement-manager';
import { SpaceManager } from '../logic/space-manager';

export class ShipManagerPc extends ShipManager implements PcShipApi {
    readonly isPlayerShip = true;
    private heatManager: HeatManager;
    private energyManager: EnergyManager;
    private smartPilotManeuveringMode: StatesToggle<SmartPilotMode>;
    private smartPilotRotationMode: StatesToggle<SmartPilotMode>;
    private movementManager: MovementManager;

    constructor(
        spaceObject: DeepReadonly<Spaceship>,
        state: ShipState,
        spaceManager: SpaceManager,
        die: Die,
        ships?: Map<string, ShipManager>,
    ) {
        super(spaceObject, state, spaceManager, die, ships);
        this.state.isPlayerShip = true;
        this.smartPilotManeuveringMode = new StatesToggle<SmartPilotMode>(
            (s) => this.setSmartPilotManeuveringMode(s),
            SmartPilotMode.VELOCITY,
            SmartPilotMode.TARGET,
            SmartPilotMode.DIRECT,
        );
        this.smartPilotRotationMode = new StatesToggle<SmartPilotMode>(
            (s) => this.setSmartPilotRotationMode(s),
            SmartPilotMode.VELOCITY,
            SmartPilotMode.TARGET,
        );
        this.heatManager = new HeatManager(this.state, this.damageManager);
        this.energyManager = new EnergyManager(this.state, this.heatManager);
        this.movementManager = new MovementManager(
            this.spaceObject,
            this.state,
            this.spaceManager,
            this,
            this.damageManager,
            this.internalProxy,
            this.die,
        );
        this.internalProxy.trySpendEnergy = this.energyManager.trySpendEnergy;
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

    update(id: IterationData) {
        super.update(id);

        this.heatManager.update(id);
        this.movementManager.update(id);
        this.handleToggleSmartPilotRotationMode();
        this.handleToggleSmartPilotManeuveringMode();
        this.energyManager.update(id);
    }

    protected validateWeaponsTargetId() {
        super.validateWeaponsTargetId();
        this.smartPilotManeuveringMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
        this.smartPilotRotationMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
    }
}
export class ShipManagerNpc extends ShipManager implements NpcShipApi {
    readonly isPlayerShip = false;

    constructor(
        spaceObject: DeepReadonly<Spaceship>,
        state: ShipState,
        spaceManager: SpaceManager,
        die: Die,
        ships?: Map<string, ShipManager>,
    ) {
        super(spaceObject, state, spaceManager, die, ships);
        this.state.isPlayerShip = false;
        this.internalProxy.trySpendEnergy = () => true;
    }

    private handleManeuvering(deltaSeconds: number) {
        const speed = XY.lengthOf(this.spaceObject.velocity);
        if (speed > this.state.maxSpeed) {
            this.state.smartPilot.maneuvering.setValue(
                XY.normalize(this.state.globalToLocal(XY.negate(this.spaceObject.velocity))),
            );
        }
        const moveDirections = vector2ShipDirections(this.state.smartPilot.maneuvering);
        const localVelocity = {
            x: this.state.smartPilot.maneuvering.x * this.state.velocityCapacity(moveDirections.x) * deltaSeconds,
            y: this.state.smartPilot.maneuvering.y * this.state.velocityCapacity(moveDirections.y) * deltaSeconds,
        };
        this.changeVelocity(this.state.localToGlobal(localVelocity));
    }

    private changeVelocity(speedToChange: XY) {
        this.spaceManager.changeVelocity(this.spaceObject.id, speedToChange);
        this.state.velocity.x = this.spaceObject.velocity.x;
        this.state.velocity.y = this.spaceObject.velocity.y;
    }

    update(id: IterationData) {
        super.update(id);
        const { deltaSeconds } = id;
        // enforce maxSpeed
        this.handleManeuvering(deltaSeconds);
        if (this.state.smartPilot.rotation) {
            const speedToChange = this.state.smartPilot.rotation * this.state.rotationCapacity * deltaSeconds;
            this.spaceManager.changeTurnSpeed(this.spaceObject.id, speedToChange);
            this.state.turnSpeed = this.spaceObject.turnSpeed;
        }
    }
}
