import { Armor, ArmorPlate } from './armor';
import { ArraySchema, MapSchema } from '@colyseus/schema';
import {
    CannonShell,
    ChainGun,
    Explosion,
    ManeuveringCommand,
    ShipArea,
    ShipState,
    SmartPilotMode,
    SmartPilotState,
    SpaceObject,
    Spaceship,
    StatesToggle,
    TargetedStatus,
    Vec2,
    XY,
    calcShellSecondsToLive,
    capToRange,
    gaussianRandom,
    lerp,
    matchLocalSpeed,
    rotateToTarget,
    rotationFromTargetTurnSpeed,
    shipAreasInRange,
    toPositiveDegreesDelta,
} from '..';
import { Damage, SpaceManager } from '../logic/space-manager';
import { FRONT_ARC, REAR_ARC } from '.';

import { Bot } from '../logic/bot';
import NormalDistribution from 'normal-distribution';
import { ShipDirection } from './ship-direction';
import { ShipSystem } from './ship-system';
import { Thruster } from './thruster';
import { uniqueId } from '../id';

interface WithConstants {
    constants: MapSchema<number>;
}
function setConstant(state: WithConstants, name: string, value: number) {
    state.constants.set(name, value);
}

function makeThruster(angle: ShipDirection): Thruster {
    const thruster = new Thruster();
    thruster.constants = new MapSchema<number>();
    setConstant(thruster, 'angle', angle);
    setConstant(thruster, 'capacity', 50);
    setConstant(thruster, 'energyCost', 0.07);
    setConstant(thruster, 'speedFactor', 3);
    setConstant(thruster, 'afterBurnerCapacity', 300);
    setConstant(thruster, 'afterBurnerEffectFactor', 1);
    setConstant(thruster, 'dps50', 250);
    thruster.damageArea = ShipArea.rear;
    return thruster;
}

function makeArmor(numberOfPlates: number): Armor {
    const armor = new Armor();
    armor.armorPlates = new ArraySchema<ArmorPlate>();
    armor.constants = new MapSchema<number>();
    setConstant(armor, 'healRate', 3.3333);
    setConstant(armor, 'plateMaxHealth', 200);
    for (let i = 0; i < numberOfPlates; i++) {
        const plate = new ArmorPlate();
        plate.health = 200;
        armor.armorPlates.push(plate);
    }
    return armor;
}

export function fixArmor(armor: Armor) {
    const plateMaxHealth = armor.plateMaxHealth;
    for (const plate of armor.armorPlates) {
        plate.health = plateMaxHealth;
    }
}
function makeShipState(id: string) {
    const state = new ShipState();
    state.id = id;
    state.constants = new MapSchema<number>();
    setConstant(state, 'energyPerSecond', 5);
    setConstant(state, 'maxEnergy', 1000);
    setConstant(state, 'maxAfterBurner', 5000);
    setConstant(state, 'afterBurnerCharge', 20);
    setConstant(state, 'afterBurnerEnergyCost', 0.07);
    setConstant(state, 'rotationCapacity', 50);
    setConstant(state, 'rotationEnergyCost', 0.07);
    setConstant(state, 'antiDriftEffectFactor', 1);
    setConstant(state, 'breaksEffectFactor', 1);
    setConstant(state, 'rotationEffectFactor', 0.5);
    setConstant(state, 'maxSpeed', 300);
    setConstant(state, 'maxSpeeFromAfterBurner', 300);
    setConstant(state, 'numberOfShipRegions', 2);
    setConstant(state, 'maxChainGunAmmo', 3600);
    state.chainGunAmmo = state.maxChainGunAmmo;
    state.thrusters = new ArraySchema();
    state.thrusters.push(makeThruster(ShipDirection.STBD));
    state.thrusters.push(makeThruster(ShipDirection.PORT));
    state.thrusters.push(makeThruster(ShipDirection.FWD));
    state.thrusters.push(makeThruster(ShipDirection.FWD));
    state.thrusters.push(makeThruster(ShipDirection.AFT));
    state.thrusters.push(makeThruster(ShipDirection.AFT));
    state.chainGun = new ChainGun();
    state.chainGun.damageArea = ShipArea.front;
    state.chainGun.constants = new MapSchema<number>();
    setConstant(state.chainGun, 'bulletsPerSecond', 20);
    setConstant(state.chainGun, 'bulletSpeed', 1000);
    setConstant(state.chainGun, 'bulletDegreesDeviation', 1);
    setConstant(state.chainGun, 'maxShellRange', 5000);
    setConstant(state.chainGun, 'minShellRange', 1000);
    setConstant(state.chainGun, 'shellRangeAim', 1000);
    setConstant(state.chainGun, 'explosionRadius', 10);
    setConstant(state.chainGun, 'explosionExpansionSpeed', 40);
    setConstant(state.chainGun, 'explosionDamageFactor', 20);
    setConstant(state.chainGun, 'explosionBlastFactor', 1);
    setConstant(state.chainGun, 'dps50', 300);
    state.smartPilot = new SmartPilotState();
    state.chainGun.shellSecondsToLive = 0;
    state.armor = makeArmor(60);
    return state;
}

export function resetShipState(state: ShipState) {
    state.energy = state.maxEnergy;
    fixArmor(state.armor);
    state.chainGun.broken = false;
    for (const thruster of state.thrusters) {
        thruster.broken = false;
    }
    state.chainGunAmmo = state.maxChainGunAmmo;
}

export const DEGREES_PER_AREA = 180;
export class ShipManager {
    public state = makeShipState(this.spaceObject.id);
    public bot: Bot | null = null;
    private target: SpaceObject | null = null;
    private smartPilotManeuveringMode: StatesToggle<SmartPilotMode>;
    private smartPilotRotationMode: StatesToggle<SmartPilotMode>;
    private systemsByAreas = new Map<number, ShipSystem[]>([
        [ShipArea.front, [this.state.chainGun]],
        [ShipArea.rear, this.state.thrusters.toArray()],
    ]);

    constructor(
        public spaceObject: Spaceship,
        private spaceManager: SpaceManager,
        private ships?: Map<string, ShipManager>,
        private onDestroy?: () => void
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
        if (!isFiring || (!this.state.chainGun.broken && this.state.chainGunAmmo > 0)) {
            this.state.chainGun.isFiring = isFiring;
        }
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
        if (value !== this.state.chainGun.shellRangeMode) {
            this.state.chainGun.shellRangeMode = value;
            this.state.chainGun.shellRange = 0;
        }
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
        this.healPlates(deltaSeconds);
        this.handleDamage();
        if (this.state.chainGun.broken && this.state.thrusters.every((t) => t.broken)) {
            this.onDestroy && this.onDestroy();
        } else {
            if (this.bot) {
                this.bot(deltaSeconds, this.spaceManager.state, this);
            }
            this.handleAfterburnerCommand();
            this.handleNextTargetCommand();
            this.handleToggleSmartPilotRotationMode();
            this.handleToggleSmartPilotManeuveringMode();
            this.validateTargetId();
            this.calcTargetedStatus();
            // sync relevant ship props
            this.syncShipProperties();
            this.updateEnergy(deltaSeconds);
            this.updateRotation(deltaSeconds);

            this.calcShellRange();
            this.calcSmartPilotManeuvering(deltaSeconds);
            this.calcSmartPilotRotation(deltaSeconds);
            const maneuveringAction = this.calcManeuveringAction();
            this.updateThrustersFromManeuvering(maneuveringAction, deltaSeconds);
            this.updateVelocityFromThrusters(deltaSeconds);

            this.updateChainGun(deltaSeconds);
            this.chargeAfterBurner(deltaSeconds);
            this.fireChainGun();
        }
    }

    private healPlates(deltaSeconds: number) {
        for (const plate of this.state.armor.armorPlates) {
            if (plate.health > 0 && plate.health < this.state.armor.plateMaxHealth) {
                plate.health = Math.min(
                    plate.health + this.state.armor.healRate * deltaSeconds,
                    this.state.armor.plateMaxHealth
                );
            }
        }
    }

    getNumberOfBrokenPlatesInRange(hitRange: [number, number]): number {
        let brokenPlates = 0;
        for (const plate of this.state.armor.platesInRange(hitRange)) {
            if (plate.health <= 0) {
                brokenPlates++;
            }
        }
        return brokenPlates;
    }

    private applyDamageToArmor(damageFactor: number, localAnglesHitRange: [number, number]) {
        for (const plate of this.state.armor.platesInRange(localAnglesHitRange)) {
            if (plate.health > 0) {
                plate.health = Math.max(plate.health - damageFactor * gaussianRandom(20, 4), 0);
            }
        }
    }

    private damageSystem(system: ShipSystem, damageObject: Damage, percentageOfBrokenPlates: number) {
        if (system.broken) {
            return;
        }
        const dps50 = system.dps50;
        const dist = new NormalDistribution(dps50, dps50 / 2);
        const destructionProbability = dist.cdf(
            (damageObject.amount / damageObject.damageDurationSeconds) * percentageOfBrokenPlates
        );
        if (Math.random() < destructionProbability) {
            system.broken = true;
        }
    }

    private handleDamage() {
        for (const damage of this.spaceManager.resolveObjectDamage(this.spaceObject)) {
            for (const hitArea of shipAreasInRange(damage.damageSurfaceArc)) {
                const areaArc = hitArea === ShipArea.front ? FRONT_ARC : REAR_ARC;
                const areaHitRangeAngles: [number, number] = [
                    Math.max(toPositiveDegreesDelta(areaArc[0]), damage.damageSurfaceArc[0]),
                    Math.min(toPositiveDegreesDelta(areaArc[1]), damage.damageSurfaceArc[1]),
                ];
                const areaUnarmoredHits = this.getNumberOfBrokenPlatesInRange(areaHitRangeAngles);
                const platesInArea = this.state.armor.numberOfPlatesInRange(areaArc);
                for (const system of this.systemsByAreas.get(hitArea) || []) {
                    this.damageSystem(system, damage, areaUnarmoredHits / platesInArea); // the more plates, more damage?
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
        if (this.state.smartPilot.broken && this.state.smartPilot.maneuveringMode !== SmartPilotMode.DIRECT) {
            return;
        }
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
        this.setBoost(maneuveringCommand.boost);
        this.setStrafe(maneuveringCommand.strafe);
    }

    private calcShellRange() {
        const aimRange = (this.state.chainGun.maxShellRange - this.state.chainGun.minShellRange) / 2;
        let baseRange: number | undefined = undefined;
        switch (this.state.chainGun.shellRangeMode) {
            case SmartPilotMode.DIRECT:
                baseRange = this.state.chainGun.minShellRange + aimRange;
                break;
            case SmartPilotMode.TARGET:
                baseRange = capToRange(
                    this.state.chainGun.minShellRange,
                    this.state.chainGun.maxShellRange,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    XY.lengthOf(XY.difference(this.target!.position, this.state.position))
                );
                break;
            default:
                throw new Error(`unknown state ${SmartPilotMode[this.state.chainGun.shellRangeMode]}`);
        }
        const range = capToRange(
            this.state.chainGun.minShellRange,
            this.state.chainGun.maxShellRange,
            baseRange + lerp([-1, 1], [-aimRange, aimRange], this.state.chainGun.shellRange)
        );
        this.state.chainGun.shellSecondsToLive = calcShellSecondsToLive(this.state, range);
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
                const mvEffect = thruster.active * thruster.capacity * thruster.speedFactor * deltaSeconds;
                const abEffect = thruster.afterBurnerActive * thruster.afterBurnerCapacity * deltaSeconds;
                return XY.byLengthAndDirection(mvEffect + abEffect, thruster.angle + this.state.angle);
            })
        );
        if (!XY.isZero(speedToChange)) {
            this.spaceManager.changeVelocity(this.spaceObject.id, speedToChange);
        }
    }

    private chargeAfterBurner(deltaSeconds: number) {
        if (this.state.afterBurnerFuel < this.state.maxAfterBurner) {
            const speedToChange = Math.min(
                this.state.maxAfterBurner - this.state.afterBurnerFuel,
                this.state.afterBurnerCharge * deltaSeconds
            );
            if (this.trySpendEnergy(speedToChange * this.state.afterBurnerEnergyCost)) {
                this.state.afterBurnerFuel += speedToChange;
            }
        }
    }

    private calcTargetedStatus() {
        let status = TargetedStatus.NONE; // default state
        if (this.ships) {
            for (const shipManager of this.ships.values()) {
                if (shipManager.state.targetId === this.state.id) {
                    if (shipManager.state.chainGun.isFiring) {
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
    }

    trySpendEnergy(value: number): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative energy');
        }
        if (this.state.energy > value) {
            this.state.energy = this.state.energy - value;
            return true;
        }
        this.state.energy = 0;
        return false;
    }

    trySpendAfterBurner(value: number): boolean {
        if (value < 0) {
            // eslint-disable-next-line no-console
            console.log('probably an error: spending negative energy');
        }
        if (this.state.afterBurnerFuel > value) {
            this.state.afterBurnerFuel = this.state.afterBurnerFuel - value;
            return true;
        }
        this.state.afterBurnerFuel = 0;
        return false;
    }

    private updateEnergy(deltaSeconds: number) {
        this.state.energy = capToRange(
            0,
            this.state.maxEnergy,
            this.state.energy + this.state.energyPerSecond * deltaSeconds
        );
    }

    private updateChainGun(deltaSeconds: number) {
        const chaingun = this.state.chainGun;
        if (chaingun.cooldown > 0) {
            // charge weapon
            chaingun.cooldown -= deltaSeconds * chaingun.bulletsPerSecond;
            if (!chaingun.isFiring && chaingun.cooldown < 0) {
                chaingun.cooldown = 0;
            }
        }
    }

    private getChainGunExplosion() {
        const result = new Explosion();
        result.secondsToLive = this.state.chainGun.explosionSecondsToLive;
        result.expansionSpeed = this.state.chainGun.explosionExpansionSpeed;
        result.damageFactor = this.state.chainGun.explosionDamageFactor;
        result.blastFactor = this.state.chainGun.explosionBlastFactor;
        return result;
    }

    private fireChainGun() {
        const chaingun = this.state.chainGun;
        if (chaingun.isFiring && chaingun.cooldown <= 0 && !chaingun.broken && this.state.chainGunAmmo > 0) {
            chaingun.cooldown += 1;
            this.state.chainGunAmmo -= 1;
            const shell = new CannonShell(this.getChainGunExplosion());

            shell.angle = gaussianRandom(this.spaceObject.angle + chaingun.angle, chaingun.bulletDegreesDeviation);
            shell.velocity = Vec2.sum(
                this.spaceObject.velocity,
                XY.rotate({ x: chaingun.bulletSpeed, y: 0 }, shell.angle)
            );
            const shellPosition = Vec2.sum(
                this.spaceObject.position,
                XY.rotate({ x: this.spaceObject.radius + shell.radius, y: 0 }, shell.angle)
            );
            shell.init(uniqueId('shell'), shellPosition);
            shell.secondsToLive = chaingun.shellSecondsToLive;
            this.spaceManager.insert(shell);
        }
    }

    public addChainGunAmmo(addedAmmo: number) {
        this.state.chainGunAmmo = Math.min(this.state.chainGunAmmo + addedAmmo, this.state.maxChainGunAmmo);
    }

    private updateRotation(deltaSeconds: number) {
        if (this.state.rotation) {
            let speedToChange = 0;
            const rotateFactor = this.state.rotation * deltaSeconds;
            const enginePower = rotateFactor * this.state.rotationCapacity;
            if (this.trySpendEnergy(Math.abs(enginePower) * this.state.rotationEnergyCost)) {
                speedToChange += enginePower * this.state.rotationEffectFactor;
            }
            this.spaceManager.ChangeTurnSpeed(this.spaceObject.id, speedToChange);
        }
    }
}
