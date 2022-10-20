import { Bot, cleanupBot, jouster, p2pGoto } from '../logic/bot';
import {
    ChainGun,
    ManeuveringCommand,
    ShipArea,
    ShipState,
    SmartPilot,
    SmartPilotMode,
    SpaceObject,
    Spaceship,
    StatesToggle,
    TargetedStatus,
    XY,
    capToRange,
    gaussianRandom,
    lerp,
    limitPercision,
    matchLocalSpeed,
    rotateToTarget,
    rotationFromTargetTurnSpeed,
    shipAreasInRange,
    toPositiveDegreesDelta,
} from '..';
import { ChainGunManager, resetChainGun } from './chain-gun-manager';
import { Damage, SpaceManager } from '../logic/space-manager';
import { FRONT_ARC, REAR_ARC } from '.';
import { RTuple2, limitPercisionHard, sinWave } from '../logic';

import { Armor } from './armor';
import { DeepReadonly } from 'ts-essentials';
import NormalDistribution from 'normal-distribution';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { Thruster } from './thruster';

function fixArmor(armor: Armor) {
    const plateMaxHealth = armor.design.plateMaxHealth;
    for (const plate of armor.armorPlates) {
        plate.health = plateMaxHealth;
    }
}
type ShipSystem = ChainGun | Thruster | Radar | SmartPilot | Reactor;

export function resetShipState(state: ShipState) {
    state.reactor.energy = state.reactor.maxEnergy;
    fixArmor(state.armor);
    if (state.chainGun) {
        resetChainGun(state.chainGun);
    }
    for (const thruster of state.thrusters) {
        resetThruster(thruster);
    }
    state.smartPilot.offsetFactor = 0;
    state.chainGunAmmo = state.design.maxChainGunAmmo;
}

function resetThruster(thruster: Thruster) {
    thruster.angleError = 0;
    thruster.availableCapacity = 1.0;
}

export type Die = {
    getRoll: (id: string) => number;
    getSuccess: (id: string, successProbability: number) => boolean;
    getRollInRange: (id: string, min: number, max: number) => number;
};
export class ShipManager {
    public bot: Bot | null = null;
    target: SpaceObject | null = null;
    private smartPilotManeuveringMode: StatesToggle<SmartPilotMode>;
    private smartPilotRotationMode: StatesToggle<SmartPilotMode>;
    private systemsByAreas = new Map<number, (ShipSystem | null)[]>([
        [ShipArea.front, [this.state.chainGun, this.state.radar, this.state.smartPilot]],
        [ShipArea.rear, [...this.state.thrusters.toArray(), this.state.reactor]],
    ]);
    private totalSeconds = 0;
    private chainGunManagers = new Array<ChainGunManager>();

    constructor(
        public spaceObject: DeepReadonly<Spaceship>,
        public state: ShipState,
        private spaceManager: SpaceManager,
        private die: Die,
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
        if (this.state.chainGun) {
            this.chainGunManagers.push(
                new ChainGunManager(this.state.chainGun, this.spaceObject, this.state, this.spaceManager, this)
            );
        }
    }

    // used by smartPilot
    private setStrafe(value: number) {
        this.state.strafe = capToRange(-1, 1, value);
    }

    // used by smartPilot
    private setBoost(value: number) {
        this.state.boost = capToRange(-1, 1, value);
    }

    // used by smartPilot
    private setRotation(value: number) {
        this.state.rotation = capToRange(-1, 1, value);
    }

    public chainGun(isFiring: boolean) {
        this.chainGunManagers[0]?.setIsFiring(isFiring);
    }

    public setSmartPilotManeuveringMode(value: SmartPilotMode) {
        if (value !== this.state.smartPilot.maneuveringMode) {
            this.state.smartPilot.maneuveringMode = value;
            this.state.smartPilot.maneuvering.x = 0;
            this.state.smartPilot.maneuvering.y = 0;
        }
    }

    public setSmartPilotRotationMode(value: SmartPilotMode) {
        if (value !== this.state.smartPilot.rotationMode) {
            this.state.smartPilot.rotationMode = value;
            this.state.smartPilot.rotation = 0;
            this.state.smartPilot.rotationTargetOffset = 0;
        }
    }

    public setShellRangeMode(value: SmartPilotMode) {
        this.chainGunManagers[0]?.setShellRangeMode(value);
    }

    public setTarget(id: string | null) {
        this.state.targetId = id;
        this.validateTargetId();
    }

    public handleNextTargetCommand() {
        if (this.state.clearTargetCommand) {
            this.state.clearTargetCommand = false;
            this.setTarget(null);
        } else if (this.state.nextTargetCommand) {
            this.state.nextTargetCommand = false;
            // currently only iterate
            let currentFound = false;
            for (const obj of this.spaceManager.state.getAll('Spaceship')) {
                if (obj.id === this.state.targetId) {
                    currentFound = true;
                } else if (currentFound && obj.id !== this.state.id) {
                    this.setTarget(obj.id);
                    return;
                }
            }
            for (const obj of this.spaceManager.state.getAll('Spaceship')) {
                if (obj.id !== this.state.id) {
                    this.setTarget(obj.id);
                    return;
                }
            }
        }
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
        this.healPlates(deltaSeconds);
        this.handleDamage();
        this.applyBotOrders();
        if (this.bot) {
            this.bot(deltaSeconds, this.spaceManager.state, this);
        }
        this.validateTargetId();
        this.chainGunManagers[0]?.update(deltaSeconds);
        this.handleAfterburnerCommand();
        this.handleNextTargetCommand();
        this.handleToggleSmartPilotRotationMode();
        this.handleToggleSmartPilotManeuveringMode();
        this.calcTargetedStatus();
        // sync relevant ship props
        this.syncShipProperties();
        this.updateEnergy(deltaSeconds);
        this.updateRotation(deltaSeconds);

        this.calcSmartPilotModes();
        this.calcSmartPilotManeuvering(deltaSeconds);
        this.calcSmartPilotRotation(deltaSeconds);
        const maneuveringAction = this.calcManeuveringAction();
        this.updateThrustersFromManeuvering(maneuveringAction, deltaSeconds);
        this.updateVelocityFromThrusters(deltaSeconds);

        this.chargeAfterBurner(deltaSeconds);
        this.updateRadarRange();
    }

    private calcSmartPilotModes() {
        if (this.state.smartPilot.broken) {
            this.setSmartPilotManeuveringMode(SmartPilotMode.DIRECT);
            this.setSmartPilotRotationMode(SmartPilotMode.DIRECT);
        }
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
                this.state.radar.malfunctionRangeFactor + this.state.radar.rangeEaseFactor,
            ] as const;
            const cappedWave = capToRange(...factorEaseRange, wave);
            return lerp(factorEaseRange, [this.state.radar.malfunctionRange, this.state.radar.basicRange], cappedWave);
        } else {
            return this.state.radar.basicRange;
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

    getNumberOfBrokenPlatesInRange(hitRange: RTuple2): number {
        let brokenPlates = 0;
        for (const [_, plate] of this.state.armor.platesInRange(hitRange)) {
            if (plate.health <= 0) {
                brokenPlates++;
            }
        }
        return brokenPlates;
    }

    private applyDamageToArmor(damageFactor: number, localAnglesHitRange: [number, number]) {
        for (const [_, plate] of this.state.armor.platesInRange(localAnglesHitRange)) {
            if (plate.health > 0) {
                const newHealth = plate.health - damageFactor * gaussianRandom(20, 4);
                plate.health = Math.max(newHealth, 0);
            }
        }
    }

    private damageSystem(system: ShipSystem, damageObject: Damage, percentageOfBrokenPlates: number) {
        if (system.broken) {
            return;
        }
        const dist = new NormalDistribution(system.damage50, system.damage50 / 2);
        const normalizedDamageProbability = dist.cdf(damageObject.amount * percentageOfBrokenPlates);
        if (this.die.getRoll(damageObject.id + 'damageSystem') < normalizedDamageProbability) {
            if (Thruster.isInstance(system)) {
                this.damageThruster(system, damageObject.id);
            } else if (ChainGun.isInstance(system)) {
                this.damageChainGun(system, damageObject.id);
            } else if (Radar.isInstance(system)) {
                this.damageRadar(system);
            } else if (SmartPilot.isInstance(system)) {
                this.damageSmartPilot(system);
            } else if (Reactor.isInstance(system)) {
                this.damageReactor(system, damageObject.id);
            }
        }
    }

    private damageReactor(reactor: Reactor, damageId: string) {
        if (!reactor.broken) {
            if (this.die.getSuccess('damageReactor' + damageId, 0.5)) {
                reactor.energy *= 0.9;
            } else {
                reactor.effeciencyFactor -= 0.05;
            }
        }
    }

    private damageSmartPilot(smartPilot: SmartPilot) {
        if (!smartPilot.broken) {
            smartPilot.offsetFactor += 0.01;
        }
    }

    private damageRadar(radar: Radar) {
        if (!radar.broken) {
            radar.malfunctionRangeFactor += 0.05;
        }
    }

    private damageThruster(thruster: Thruster, damageId: string) {
        if (thruster.broken) {
            return;
        }
        if (this.die.getSuccess('damageThruster' + damageId, 0.5)) {
            thruster.angleError +=
                limitPercision(this.die.getRollInRange('thrusterAngleOffset' + damageId, 1, 3)) *
                (this.die.getSuccess('thrusterAngleSign' + damageId, 0.5) ? 1 : -1);
            thruster.angleError = capToRange(-180, 180, thruster.angleError);
        } else {
            thruster.availableCapacity -= limitPercision(
                this.die.getRollInRange('availableCapacity' + damageId, 0.01, 0.1)
            );
        }
    }

    private damageChainGun(chainGun: ChainGun, damageId: string) {
        if (!chainGun.broken) {
            if (this.die.getSuccess('damageChaingun' + damageId, 0.5)) {
                chainGun.angleOffset +=
                    limitPercision(this.die.getRollInRange('chainGunAngleOffset' + damageId, 1, 2)) *
                    (this.die.getSuccess('chainGunAngleSign' + damageId, 0.5) ? 1 : -1);
            } else {
                chainGun.cooldownFactor += 1;
            }
        }
    }

    private handleDamage() {
        for (const damage of this.spaceManager.resolveObjectDamage(this.spaceObject.id)) {
            for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {
                const areaArc = hitArea === ShipArea.front ? FRONT_ARC : REAR_ARC;
                const areaHitRangeAngles: [number, number] = [
                    Math.max(toPositiveDegreesDelta(areaArc[0]), damage.damageSurfaceArc[0]),
                    Math.min(toPositiveDegreesDelta(areaArc[1]), damage.damageSurfaceArc[1]),
                ];
                const areaUnarmoredHits = this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles);
                if (areaUnarmoredHits) {
                    const platesInArea = this.state.armor.numberOfPlatesInRange(areaArc);
                    for (const system of this.systemsByAreas.get(hitArea) || []) {
                        if (system) this.damageSystem(system, damage, areaUnarmoredHits / platesInArea); // the more plates, more damage?
                    }
                }
                this.applyDamageToArmor(damage.amount, areaHitRangeAngles);
            }
        }
    }

    private handleAfterburnerCommand() {
        if (
            this.state.afterBurner !== this.state.afterBurnerCommand &&
            (!this.shouldEnforceMaxSpeed() || this.state.afterBurner < this.state.afterBurnerCommand)
        ) {
            this.state.afterBurner = this.state.afterBurnerCommand;
        }
    }

    private calcSmartPilotManeuvering(deltaSeconds: number) {
        const offsetFactor =
            this.state.smartPilot.maneuveringMode === SmartPilotMode.DIRECT ? 0 : this.state.smartPilot.offsetFactor;
        const error = XY.byLengthAndDirection(offsetFactor, this.die.getRollInRange('smartPilotOffset', -180, 180));

        let maneuveringCommand: ManeuveringCommand | undefined = undefined;
        switch (this.state.smartPilot.maneuveringMode) {
            case SmartPilotMode.DIRECT: {
                maneuveringCommand = {
                    strafe: this.state.smartPilot.maneuvering.y,
                    boost: this.state.smartPilot.maneuvering.x,
                };
                break;
            }
            case SmartPilotMode.TARGET: {
                const velocity = XY.add(
                    XY.scale(this.state.smartPilot.maneuvering, this.state.maxSpeed),
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.state.globalToLocal(this.target!.velocity)
                );
                maneuveringCommand = matchLocalSpeed(deltaSeconds, this.state, velocity);
                break;
            }
            case SmartPilotMode.VELOCITY: {
                const velocity = XY.scale(this.state.smartPilot.maneuvering, this.state.maxSpeed);
                maneuveringCommand = matchLocalSpeed(deltaSeconds, this.state, velocity);
                break;
            }
        }
        this.setBoost(maneuveringCommand.boost + error.y);
        this.setStrafe(maneuveringCommand.strafe + error.x);
    }

    private calcSmartPilotRotation(deltaSeconds: number) {
        let rotationCommand: number | undefined = undefined;
        switch (this.state.smartPilot.rotationMode) {
            case SmartPilotMode.DIRECT:
                rotationCommand = this.state.smartPilot.rotation;
                break;
            case SmartPilotMode.TARGET: {
                this.state.smartPilot.rotationTargetOffset = capToRange(
                    -1,
                    1,
                    this.state.smartPilot.rotationTargetOffset +
                        (this.state.smartPilot.rotation * deltaSeconds * this.state.smartPilot.aimOffsetSpeed) /
                            this.state.smartPilot.maxTargetAimOffset
                );
                rotationCommand = rotateToTarget(
                    deltaSeconds,
                    this.state,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    this.target!.position,
                    this.state.smartPilot.rotationTargetOffset * this.state.smartPilot.maxTargetAimOffset
                );
                break;
            }
            case SmartPilotMode.VELOCITY: {
                rotationCommand = rotationFromTargetTurnSpeed(
                    deltaSeconds,
                    this.state,
                    this.state.smartPilot.rotation * this.state.smartPilot.maxTurnSpeed
                );
                break;
            }
        }
        this.setRotation(rotationCommand);
    }

    shouldEnforceMaxSpeed() {
        const maxSpeed = this.state.getMaxSpeedForAfterburner(this.state.afterBurnerCommand);
        return (
            this.state.smartPilot.maneuveringMode !== SmartPilotMode.DIRECT &&
            XY.lengthOf(this.spaceObject.velocity) > maxSpeed
        );
    }

    private calcManeuveringAction() {
        if (this.shouldEnforceMaxSpeed()) {
            return XY.normalize(XY.negate(this.spaceObject.velocity));
        } else {
            const boostFactor = XY.scale(XY.rotate(XY.one, this.spaceObject.angle), this.state.boost);
            const strafeFactor = XY.scale(XY.rotate(XY.one, this.spaceObject.angle + 90), this.state.strafe);
            const antiDriftFactor = XY.scale(
                XY.normalize(XY.negate(XY.projection(this.spaceObject.velocity, this.spaceObject.directionAxis))),
                this.state.antiDrift
            );
            const breaksFactor = XY.scale(XY.normalize(XY.negate(this.spaceObject.velocity)), this.state.breaks);
            const desiredSpeed = XY.sum(boostFactor, strafeFactor, antiDriftFactor, breaksFactor);
            return desiredSpeed;
        }
    }

    private updateThrustersFromManeuvering(maneuveringAction: XY, deltaSeconds: number) {
        for (const thruster of this.state.thrusters) {
            thruster.afterBurnerActive = 0;
            thruster.active = 0;
            const globalAngle = thruster.angle + this.state.angle;
            const desiredAction = capToRange(0, 1, XY.rotate(maneuveringAction, -globalAngle).x);
            const axisCapacity = thruster.capacity * deltaSeconds;
            if (this.trySpendEnergy(desiredAction * axisCapacity * thruster.energyCost)) {
                thruster.active = desiredAction;
            }
            if (this.state.afterBurner) {
                const axisAfterBurnerCapacity = thruster.afterBurnerCapacity * deltaSeconds;
                const desireAfterBurnedAction = Math.min(desiredAction * this.state.afterBurner, 1);
                if (this.trySpendAfterBurner(desireAfterBurnedAction * axisAfterBurnerCapacity)) {
                    thruster.afterBurnerActive = desireAfterBurnedAction;
                }
            }
        }
    }

    private updateVelocityFromThrusters(deltaSeconds: number) {
        const speedToChange = XY.sum(
            ...this.state.thrusters.map((thruster) => {
                const mvEffect =
                    thruster.active *
                    thruster.capacity *
                    thruster.availableCapacity *
                    thruster.speedFactor *
                    deltaSeconds;
                const abEffect = thruster.afterBurnerActive * thruster.afterBurnerCapacity * deltaSeconds;
                return XY.byLengthAndDirection(
                    mvEffect + abEffect,
                    thruster.angle + thruster.angleError + this.state.angle
                );
            })
        );
        if (!XY.isZero(speedToChange)) {
            this.spaceManager.changeVelocity(this.spaceObject.id, speedToChange);
            this.state.velocity.x = this.spaceObject.velocity.x;
            this.state.velocity.y = this.spaceObject.velocity.y;
        }
    }

    private chargeAfterBurner(deltaSeconds: number) {
        if (this.state.reactor.afterBurnerFuel < this.state.reactor.maxAfterBurnerFuel) {
            const afterBurnerFuelDelta = Math.min(
                this.state.reactor.maxAfterBurnerFuel - this.state.reactor.afterBurnerFuel,
                this.state.reactor.afterBurnerCharge * deltaSeconds
            );
            if (this.trySpendEnergy(afterBurnerFuelDelta * this.state.reactor.afterBurnerEnergyCost)) {
                this.state.reactor.afterBurnerFuel = limitPercisionHard(
                    this.state.reactor.afterBurnerFuel + afterBurnerFuelDelta
                );
            }
        }
    }

    private calcTargetedStatus() {
        let status = TargetedStatus.NONE; // default state
        if (this.ships) {
            for (const shipManager of this.ships.values()) {
                if (shipManager.state.targetId === this.state.id) {
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

    private validateTargetId() {
        if (this.state.targetId) {
            this.target = this.spaceManager.state.get(this.state.targetId) || null;
            if (!this.target) {
                this.state.targetId = null;
            }
        } else {
            this.target = null;
        }
        this.smartPilotManeuveringMode.setLegalState(SmartPilotMode.TARGET, !!this.target);
        this.smartPilotRotationMode.setLegalState(SmartPilotMode.TARGET, !!this.target);
        this.setShellRangeMode(this.target ? SmartPilotMode.TARGET : SmartPilotMode.DIRECT);
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
        this.state.radarRange = this.spaceObject.radarRange;
    }

    trySpendEnergy(value: number): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative energy');
        }
        if (this.state.reactor.energy > value) {
            this.state.reactor.energy = this.state.reactor.energy - value;
            return true;
        }
        this.state.reactor.energy = 0;
        return false;
    }

    trySpendAfterBurner(value: number): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative afterBurnerFuel');
        }
        if (this.state.reactor.afterBurnerFuel > value) {
            this.state.reactor.afterBurnerFuel = limitPercisionHard(this.state.reactor.afterBurnerFuel - value);
            return true;
        }
        this.state.reactor.afterBurnerFuel = 0;
        return false;
    }

    private updateEnergy(deltaSeconds: number) {
        this.state.reactor.energy = capToRange(
            0,
            this.state.reactor.maxEnergy,
            this.state.reactor.energy + this.state.reactor.energyPerSecond * deltaSeconds
        );
    }

    public addChainGunAmmo(addedAmmo: number) {
        this.state.chainGunAmmo = Math.min(this.state.chainGunAmmo + addedAmmo, this.state.design.maxChainGunAmmo);
    }

    private updateRotation(deltaSeconds: number) {
        if (this.state.rotation) {
            let speedToChange = 0;
            const rotateFactor = this.state.rotation * deltaSeconds;
            const enginePower = rotateFactor * this.state.design.rotationCapacity;
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.design.rotationEnergyCost)) {
                speedToChange += enginePower;
            }
            this.spaceManager.changeTurnSpeed(this.spaceObject.id, speedToChange);
            this.state.turnSpeed = this.spaceObject.turnSpeed;
        }
    }
}
