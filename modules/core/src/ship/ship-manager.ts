import { Bot, cleanupBot, jouster, p2pGoto } from '../logic/bot';
import {
    ChainGun,
    Faction,
    ShipArea,
    ShipState,
    SmartPilot,
    SmartPilotMode,
    SpaceObject,
    Spaceship,
    StatesToggle,
    TargetedStatus,
    capToRange,
    gaussianRandom,
    lerp,
    limitPercision,
    projectileModels,
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
import { Iterator } from '../logic/iteration';
import { Magazine } from './magazine';
import { MovementManager } from './movement-manager';
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
type ShipSystem = ChainGun | Thruster | Radar | SmartPilot | Reactor | Magazine;

export function resetShipState(state: ShipState) {
    state.reactor.energy = state.reactor.design.maxEnergy;
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

export type Die = {
    getRoll: (id: string) => number;
    getSuccess: (id: string, successProbability: number) => boolean;
    getRollInRange: (id: string, min: number, max: number) => number;
};
export class ShipManager {
    public bot: Bot | null = null;
    public target: SpaceObject | null = null;
    private smartPilotManeuveringMode: StatesToggle<SmartPilotMode>;
    private smartPilotRotationMode: StatesToggle<SmartPilotMode>;
    private systemsByAreas = new Map<number, (ShipSystem | null)[]>([
        [ShipArea.front, [this.state.chainGun, this.state.radar, this.state.smartPilot, this.state.magazine]],
        [ShipArea.rear, [...this.state.thrusters.toArray(), this.state.reactor, ...this.state.tubes.toArray()]],
    ]);
    private totalSeconds = 0;
    private tubeManagers = new Array<ChainGunManager>();
    private chainGunManager: ChainGunManager | null = null;
    private movementManager: MovementManager;

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
        if (this.state.chainGun) {
            this.chainGunManager = new ChainGunManager(
                this.state.chainGun,
                this.spaceObject,
                this.state,
                this.spaceManager,
                this
            );
        }
        this.movementManager = new MovementManager(this.spaceObject, this.state, this.spaceManager, this, this.die);
        for (const tube of this.state.tubes) {
            this.tubeManagers.push(new ChainGunManager(tube, this.spaceObject, this.state, this.spaceManager, this));
        }
    }

    public setSmartPilotManeuveringMode(value: SmartPilotMode) {
        if (value === SmartPilotMode.TARGET && !this.target) {
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
        if (value === SmartPilotMode.TARGET && !this.target) {
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
        this.validateTargetId();
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
        this.healPlates(deltaSeconds);
        this.handleDamage();
        this.applyBotOrders();
        if (this.bot) {
            this.bot(deltaSeconds, this.spaceManager.state, this);
        }
        this.validateTargetId();
        this.chainGunManager?.update(deltaSeconds);
        for (const tubeManager of this.tubeManagers) {
            tubeManager.update(deltaSeconds);
        }
        this.movementManager.update(deltaSeconds);
        this.handleTargetCommands();
        this.handleToggleSmartPilotRotationMode();
        this.handleToggleSmartPilotManeuveringMode();
        this.calcTargetedStatus();
        // sync relevant ship props
        this.syncShipProperties();
        this.updateEnergy(deltaSeconds);

        this.calcSmartPilotRotation(deltaSeconds);

        this.chargeAfterBurner(deltaSeconds);
        this.updateRadarRange();
        this.updateChainGunAmmo();
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
        const dist = new NormalDistribution(system.design.damage50, system.design.damage50 / 2);
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
            } else if (Magazine.isInstance(system)) {
                this.damageMagazine(system, damageObject.id);
            }
        }
    }

    private damageMagazine(magazine: Magazine, damageId: string) {
        if (!magazine.broken) {
            if (this.die.getSuccess('damageMagazine' + damageId, 0.5)) {
                // todo convert to a defectible property that accumulates damage
                const idx = this.die.getRollInRange('magazineostAmmo' + damageId, 0, projectileModels.length);
                const projectileKey = projectileModels[idx];
                magazine[`count_${projectileKey}`] = Math.round(
                    magazine[`count_${projectileKey}`] * (1 - magazine.design.capacityDamageFactor)
                );
            } else {
                magazine.capacity *= 1 - magazine.design.capacityDamageFactor;
            }
        }
    }

    private damageReactor(reactor: Reactor, damageId: string) {
        if (!reactor.broken) {
            if (this.die.getSuccess('damageReactor' + damageId, 0.5)) {
                // todo convert to a defectible property that accumulates damage
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
                chainGun.rateOfFireFactor *= 0.9;
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

    private calcSmartPilotRotation(deltaSeconds: number) {
        let rotationCommand: number | undefined = undefined;
        switch (this.state.smartPilot.rotationMode) {
            case SmartPilotMode.DIRECT:
                rotationCommand = this.state.smartPilot.rotation;
                break;
            case SmartPilotMode.TARGET: {
                if (this.target) {
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
                        this.target.position,
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

    private chargeAfterBurner(deltaSeconds: number) {
        if (this.state.reactor.afterBurnerFuel < this.state.reactor.design.maxAfterBurnerFuel) {
            const afterBurnerFuelDelta = Math.min(
                this.state.reactor.design.maxAfterBurnerFuel - this.state.reactor.afterBurnerFuel,
                this.state.reactor.design.afterBurnerCharge * deltaSeconds
            );
            if (this.trySpendEnergy(afterBurnerFuelDelta * this.state.reactor.design.afterBurnerEnergyCost)) {
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

    private validateTargetId() {
        if (this.state.weaponsTarget.targetId) {
            this.target = this.spaceManager.state.get(this.state.weaponsTarget.targetId) || null;
            if (!this.target) {
                this.state.weaponsTarget.targetId = null;
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
        this.state.radius = this.spaceObject.radius;
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

    private updateEnergy(deltaSeconds: number) {
        this.state.reactor.energy = capToRange(
            0,
            this.state.reactor.design.maxEnergy,
            this.state.reactor.energy + this.state.reactor.energyPerSecond * deltaSeconds
        );
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
