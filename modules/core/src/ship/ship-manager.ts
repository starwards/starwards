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
import { DeepReadonly } from 'ts-essentials';
import { EnergyManager } from './energy-manager';
import { IterationData } from '../updateable';
import { MovementManager } from './movement-manager';
import { RepairManager } from './repair-manager';
import { SpaceManager } from '../logic/space-manager';

export class ShipManagerPc extends ShipManager implements PcShipApi {
    readonly isPlayerShip = true;
    private energyManager: EnergyManager;
    private repairManager: RepairManager;
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
        this.energyManager = new EnergyManager(this.state, this.heatManager);
        this.repairManager = new RepairManager(this.state, this.energyManager, this.heatManager);
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

        this.movementManager.update(id);
        this.handleToggleSmartPilotRotationMode();
        this.handleToggleSmartPilotManeuveringMode();
        this.repairManager.update(id);
        this.energyManager.update(id);
    }

    protected validateWeaponsTargetId(deltaSeconds = 0) {
        super.validateWeaponsTargetId(deltaSeconds);
        this.smartPilotManeuveringMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
        this.smartPilotRotationMode.setLegalState(SmartPilotMode.TARGET, !!this.weaponsTarget);
    }
}
export class ShipManagerNpc extends ShipManager implements NpcShipApi {
    readonly isPlayerShip = false;
    private readonly aggro = new AggroManager();

    constructor(
        spaceObject: DeepReadonly<Spaceship>,
        state: ShipState,
        spaceManager: SpaceManager,
        die: Die,
        ships?: Map<string, ShipManager>,
    ) {
        super(spaceObject, state, spaceManager, die, ships);
        this.state.isPlayerShip = false;
        /**
         * NPCs have no power-allocation UI to keep a reactor budget solvent under sustained combat,
         * so every system -- weapons, radar, maneuvering alike -- draws free energy here; wiring a
         * real per-tick energy cost into maneuvering was tried for #2208 and made NPCs strand
         * themselves mid-engagement (orbit-capture and heat-management sims never closed distance
         * again once the reactor ran dry, since nothing manages their power the way a player does).
         * Damage still bites without it: `rotationCapacity` and `velocityCapacity` factor in
         * `effectiveness`/`efficiency`, so a maneuvering system shot to pieces or hacked really does
         * turn and thrust slower, same as a player ship's -- there is just no finite joule budget
         * underneath that degradation for a bot that cannot manage one.
         */
        this.internalProxy.trySpendEnergy = () => true;
        this.damageManager.onWeaponHit = (attackerId, amount) => this.aggro.noteHit(attackerId, amount);
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
    }

    private handleManeuvering(deltaSeconds: number) {
        const moveDirections = vector2ShipDirections(this.state.smartPilot.maneuvering);
        const localVelocity = {
            x: this.state.smartPilot.maneuvering.x * this.state.velocityCapacity(moveDirections.x) * deltaSeconds,
            y: this.state.smartPilot.maneuvering.y * this.state.velocityCapacity(moveDirections.y) * deltaSeconds,
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
        // enforce maxSpeed
        this.handleManeuvering(deltaSeconds);
        if (this.state.smartPilot.rotation) {
            const speedToChange = this.state.smartPilot.rotation * this.state.rotationCapacity * deltaSeconds;
            this.spaceManager.changeTurnSpeed(this.spaceObject.id, speedToChange);
            // Immediate sync so code later in the same tick reads the updated turnSpeed
            this.state.spaceship.turnSpeed = this.spaceObject.turnSpeed;
        }
    }
}
