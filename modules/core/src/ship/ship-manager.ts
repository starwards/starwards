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

import { AggroCharacter } from './threat-table';
import { AggroManager } from './aggro-manager';
import { CrewOrdersManager } from './crew-orders-manager';
import { DeepReadonly } from 'ts-essentials';
import { EnergyManager } from './energy-manager';
import { EngineerGovernor } from './engineer-governor';
import { IterationData } from '../updateable';
import { MovementManager } from './movement-manager';
import { RepairManager } from './repair-manager';
import { ScanBeamAutomation } from './scan-beam-automation';
import { SpaceManager } from '../logic/space-manager';
import { capToRange } from '../logic';

export class ShipManagerPc extends ShipManager implements PcShipApi {
    readonly isPlayerShip = true;
    private energyManager: EnergyManager;
    private repairManager: RepairManager;
    private crewOrdersManager: CrewOrdersManager;
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
            // with no weapons target, cycling skips TARGET rather than asking for it
            (s) => (s !== SmartPilotMode.TARGET || this.weaponsTarget) && this.setSmartPilotRotationMode(s),
            SmartPilotMode.VELOCITY,
            SmartPilotMode.TARGET,
        );
        this.energyManager = new EnergyManager(this.state, this.heatManager);
        this.repairManager = new RepairManager(this.state, this.energyManager, this.heatManager);
        this.crewOrdersManager = new CrewOrdersManager(this.state.orderBoard);
        this.movementManager = new MovementManager(
            this.spaceObject,
            this.state,
            this.spaceManager,
            this,
            this.damageManager,
            this.internalProxy,
            this.die,
        );
        this.internalProxy.drawEnergy = this.energyManager.drawEnergy;
    }

    /** The previous tick's energy demand and what the reactor granted of it (see `EnergyManager.lastFlow`). */
    get energyFlow() {
        return this.energyManager.lastFlow;
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

        this.movementManager.update(id);
        this.handleToggleSmartPilotRotationMode();
        this.handleToggleSmartPilotManeuveringMode();
        this.repairManager.update(id);
        this.energyManager.update(id);
        this.crewOrdersManager.update(id);
    }

    protected validateWeaponsTargetId(deltaSeconds = 0) {
        super.validateWeaponsTargetId(deltaSeconds);
        this.smartPilotManeuveringMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
        this.smartPilotRotationMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
    }
}
/**
 * Whether a new NPC ship runs the real {@link EnergyManager} and {@link RepairManager} (with the
 * {@link EngineerGovernor} standing in for its crew). Per-ship override: {@link ShipManagerNpc.setRealEnergy}.
 */
export const NPC_REAL_ENERGY_DEFAULT = false;

export class ShipManagerNpc extends ShipManager implements NpcShipApi {
    readonly isPlayerShip = false;
    private energyManager: EnergyManager | null = null;
    private repairManager: RepairManager | null = null;
    private governor: EngineerGovernor | null = null;
    private readonly aggro = new AggroManager();
    /** Nobody crews a station's or platform's signals, so their scan beams sweep and follow on their own (M4.31). */
    private readonly scanBeams: ScanBeamAutomation | null;

    constructor(
        spaceObject: DeepReadonly<Spaceship>,
        state: ShipState,
        spaceManager: SpaceManager,
        die: Die,
        ships?: Map<string, ShipManager>,
    ) {
        super(spaceObject, state, spaceManager, die, ships);
        this.state.isPlayerShip = false;
        this.internalProxy.drawEnergy = () => 1;
        this.setRealEnergy(NPC_REAL_ENERGY_DEFAULT);
        this.damageManager.onWeaponHit = (attackerId, amount) => this.aggro.noteHit(attackerId, amount);
        this.scanBeams =
            this.state.smartPilot.design.maxSpeed === 0 ? new ScanBeamAutomation(this.state, spaceManager) : null;
    }

    /** Whether this NPC meters energy and works a repair queue like a player ship, governed by a reflex engineer. */
    get realEnergy() {
        return this.energyManager !== null;
    }

    /**
     * Switches this NPC between the real energy/repair rules and free draws.
     * Free draws exist because NPCs have no crew to keep a reactor budget solvent (#2208: a metered
     * maneuvering system stranded them mid-engagement); with the flag on the {@link EngineerGovernor}
     * plays that crew, shedding power before manoeuvring can run dry.
     */
    setRealEnergy(enabled: boolean) {
        if (enabled === this.realEnergy) {
            return;
        }
        if (enabled) {
            const energyManager = new EnergyManager(this.state, this.heatManager);
            this.energyManager = energyManager;
            this.repairManager = new RepairManager(this.state, energyManager, this.heatManager);
            this.governor = new EngineerGovernor(this.state);
            this.internalProxy.drawEnergy = energyManager.drawEnergy;
        } else {
            this.governor?.release();
            this.energyManager = null;
            this.repairManager = null;
            this.governor = null;
            this.state.repairQueue.slots.clear();
            this.internalProxy.drawEnergy = () => 1;
        }
    }

    /** Sets how this NPC's aggro reacts to attackers; `null` keeps it on its standing order. */
    setAggroCharacter(character: AggroCharacter | null) {
        this.aggro.character = character;
    }

    /** This NPC's aggro character, `null` for none. */
    get aggroCharacter() {
        return this.aggro.character;
    }

    /** The attacker this NPC's aggro currently has it engage, `null` while on its standing order. */
    get aggroHeldId() {
        return this.aggro.heldId;
    }

    /** Ticks aggro before automation, so automation engages this tick's held attacker. */
    protected updateAutomation(id: IterationData) {
        this.aggro.update(id.deltaSeconds, this.automationManager.hostileIdsInReach(), (attackerId) => {
            const attacker = this.spaceManager.state.get(attackerId);
            return !attacker || attacker.destroyed;
        });
        const heldId = this.aggro.heldId;
        const { heldEngagementEnded } = this.automationManager.update(id, heldId);
        if (heldId && heldEngagementEnded) {
            this.aggro.forget(heldId);
        }
        this.state.aggroTargetId = this.aggro.heldId ?? '';
        this.scanBeams?.update();
    }

    /**
     * What fraction of the thrust it asks for the reactor grants this tick -- the same per-thruster
     * demand a player ship's `MovementManager` draws, so an NPC pays for flight like one. 1 when
     * energy is free (flag off) or nothing is asked for.
     */
    private drawThrustEnergy(deltaSeconds: number) {
        if (!this.energyManager) {
            return 1;
        }
        const action = this.state.localToGlobal(this.state.smartPilot.maneuvering);
        let asked = 0;
        let granted = 0;
        for (const thruster of this.state.thrusters) {
            if (!thruster.effectiveness) {
                continue;
            }
            const desired = capToRange(0, 1, XY.rotate(action, -thruster.getGlobalBearing(this.state)).x);
            const cost =
                desired *
                thruster.design.capacity *
                thruster.effectiveness *
                deltaSeconds *
                thruster.design.energyCost *
                thruster.powerDrawFactor;
            asked += cost;
            granted += cost * this.energyManager.drawEnergy(cost, thruster);
        }
        return asked > 0 ? granted / asked : 1;
    }

    /** The fraction of the turn it asks for the reactor grants this tick; see {@link drawThrustEnergy}. */
    private drawRotationEnergy(deltaSeconds: number) {
        const { maneuvering } = this.state;
        const rotation = Math.abs(this.state.smartPilot.rotation);
        if (!this.energyManager || !rotation) {
            return 1;
        }
        const enginePower = rotation * deltaSeconds * maneuvering.effectiveness * maneuvering.design.rotationCapacity;
        return this.energyManager.drawEnergy(
            enginePower * maneuvering.design.rotationEnergyCost * maneuvering.powerDrawFactor,
            maneuvering,
        );
    }

    private handleManeuvering(deltaSeconds: number) {
        const moveDirections = vector2ShipDirections(this.state.smartPilot.maneuvering);
        const supply = this.drawThrustEnergy(deltaSeconds);
        const localVelocity = {
            x:
                this.state.smartPilot.maneuvering.x *
                this.state.velocityCapacity(moveDirections.x) *
                deltaSeconds *
                supply,
            y:
                this.state.smartPilot.maneuvering.y *
                this.state.velocityCapacity(moveDirections.y) *
                deltaSeconds *
                supply,
        };
        this.changeVelocity(this.state.localToGlobal(localVelocity));
        this.capMaxSpeed();
    }

    /**
     * Enforces `state.maxSpeed` by clamping the resulting velocity's magnitude, not by overwriting
     * the commanded `smartPilot.maneuvering` with a pure retrograde-thrust vector. The overwrite
     * approach discarded whatever the automation actually asked for the instant speed crossed the
     * cap -- including a lateral weave overlay (issue #2146), which needs the ship over the cap
     * (closing at full boost) to ever have room to add sideways motion -- and then re-triggered
     * every tick once pinned there, a full-throttle bang-bang loop that issue #2099 identifies as a
     * resonance risk on zero-`maxSpeed` hulls. A direct clamp has no overshoot to resonate with.
     */
    private capMaxSpeed() {
        const speed = XY.lengthOf(this.spaceObject.velocity);
        if (speed > this.state.maxSpeed) {
            const capped = XY.byLengthAndDirection(this.state.maxSpeed, XY.angleOf(this.spaceObject.velocity));
            this.changeVelocity(XY.difference(capped, this.spaceObject.velocity));
        }
    }

    private changeVelocity(speedToChange: XY) {
        this.spaceManager.changeVelocity(this.spaceObject.id, speedToChange);
        // Immediate sync so code later in the same tick reads the updated velocity
        this.state.spaceship.velocity.x = this.spaceObject.velocity.x;
        this.state.spaceship.velocity.y = this.spaceObject.velocity.y;
    }

    update(id: IterationData) {
        super.update(id);
        const { deltaSeconds } = id;
        this.governor?.update(id);
        this.repairManager?.update(id);
        this.energyManager?.update(id);
        // enforce maxSpeed
        this.handleManeuvering(deltaSeconds);
        if (this.state.smartPilot.rotation) {
            const speedToChange =
                this.state.smartPilot.rotation *
                this.state.rotationCapacity *
                deltaSeconds *
                this.drawRotationEnergy(deltaSeconds);
            this.spaceManager.changeTurnSpeed(this.spaceObject.id, speedToChange);
            // Immediate sync so code later in the same tick reads the updated turnSpeed
            this.state.spaceship.turnSpeed = this.spaceObject.turnSpeed;
        }
    }
}
