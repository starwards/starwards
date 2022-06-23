import { Armor, ArmorPlate } from './armor';
import {
    ArmorModel,
    ChaingunModel,
    RadarModel,
    ShipModel,
    ShipPropertiesModel,
    SmartPilotModel,
    ThrusterModel,
} from './ship-configuration';
import { ArraySchema, MapSchema } from '@colyseus/schema';
import { ChainGun, ShipState, SmartPilot } from '..';

import { Radar } from './radar';
import { Thruster } from './thruster';
import { getDirectionFromConfig } from '.';
import { setConstant } from '../utils';

function makeThruster(thrusterModel: ThrusterModel): Thruster {
    const thruster = new Thruster();
    thruster.constants = new MapSchema<number>();
    setConstant(thruster, 'angle', getDirectionFromConfig(thrusterModel.angle));
    setConstant(thruster, 'maxAngleError', thrusterModel.maxAngleError);
    setConstant(thruster, 'capacity', thrusterModel.capacity);
    setConstant(thruster, 'energyCost', thrusterModel.energyCost);
    setConstant(thruster, 'speedFactor', thrusterModel.speedFactor);
    setConstant(thruster, 'afterBurnerCapacity', thrusterModel.afterBurnerCapacity);
    setConstant(thruster, 'afterBurnerEffectFactor', thrusterModel.afterBurnerEffectFactor);
    setConstant(thruster, 'damage50', thrusterModel.damage50);
    setConstant(thruster, 'completeDestructionProbability', thrusterModel.completeDestructionProbability);
    return thruster;
}

function makeArmor(armorModel: ArmorModel): Armor {
    const armor = new Armor();
    armor.armorPlates = new ArraySchema<ArmorPlate>();
    armor.constants = new MapSchema<number>();
    setConstant(armor, 'healRate', armorModel.healRate);
    setConstant(armor, 'plateMaxHealth', armorModel.plateMaxHealth);
    for (let i = 0; i < armorModel.numberOfPlates; i++) {
        const plate = new ArmorPlate();
        plate.health = armorModel.plateMaxHealth;
        armor.armorPlates.push(plate);
    }
    return armor;
}

function makeShip(id: string, properties: ShipPropertiesModel) {
    const state = new ShipState();
    state.id = id;
    state.constants = new MapSchema<number>();
    setConstant(state, 'energyPerSecond', properties.energyPerSecond);
    setConstant(state, 'maxEnergy', properties.maxEnergy);
    setConstant(state, 'maxAfterBurner', properties.maxAfterBurner);
    setConstant(state, 'afterBurnerCharge', properties.afterBurnerCharge);
    setConstant(state, 'afterBurnerEnergyCost', properties.afterBurnerEnergyCost);
    setConstant(state, 'rotationCapacity', properties.rotationCapacity);
    setConstant(state, 'rotationEnergyCost', properties.rotationEnergyCost);
    setConstant(state, 'maxChainGunAmmo', properties.maxChainGunAmmo);
    state.chainGunAmmo = state.maxChainGunAmmo;
    return state;
}

function makeChainGun(model: ChaingunModel) {
    const chainGun = new ChainGun();
    chainGun.constants = new MapSchema<number>();
    setConstant(chainGun, 'bulletsPerSecond', model.bulletsPerSecond);
    setConstant(chainGun, 'bulletSpeed', model.bulletSpeed);
    setConstant(chainGun, 'bulletDegreesDeviation', model.bulletDegreesDeviation);
    setConstant(chainGun, 'maxShellRange', model.maxShellRange);
    setConstant(chainGun, 'minShellRange', model.minShellRange);
    setConstant(chainGun, 'shellRangeAim', model.shellRangeAim);
    setConstant(chainGun, 'explosionRadius', model.explosionRadius);
    setConstant(chainGun, 'explosionExpansionSpeed', model.explosionExpansionSpeed);
    setConstant(chainGun, 'explosionDamageFactor', model.explosionDamageFactor);
    setConstant(chainGun, 'explosionBlastFactor', model.explosionBlastFactor);
    setConstant(chainGun, 'damage50', model.damage50);
    setConstant(chainGun, 'completeDestructionProbability', model.completeDestructionProbability);
    chainGun.shellSecondsToLive = 0;
    return chainGun;
}

function makeRadar(radarModel: RadarModel) {
    const radar = new Radar();
    radar.constants = new MapSchema<number>();
    setConstant(radar, 'damage50', radarModel.damage50);
    setConstant(radar, 'basicRange', radarModel.basicRange);
    setConstant(radar, 'rangeEaseFactor', radarModel.rangeEaseFactor);
    setConstant(radar, 'malfunctionRange', radarModel.malfunctionRange);
    return radar;
}

function makeSmartPilot(smartPilotModel: SmartPilotModel) {
    const smartPilot = new SmartPilot();
    smartPilot.constants = new MapSchema<number>();
    setConstant(smartPilot, 'maxTargetAimOffset', smartPilotModel.maxTargetAimOffset);
    setConstant(smartPilot, 'aimOffsetSpeed', smartPilotModel.aimOffsetSpeed);
    setConstant(smartPilot, 'maxTurnSpeed', smartPilotModel.maxTurnSpeed);
    setConstant(smartPilot, 'offsetBrokenThreshold', smartPilotModel.offsetBrokenThreshold);
    setConstant(smartPilot, 'damage50', smartPilotModel.damage50);
    setConstant(smartPilot, 'maxSpeed', smartPilotModel.maxSpeed);
    setConstant(smartPilot, 'maxSpeedFromAfterBurner', smartPilotModel.maxSpeedFromAfterBurner);
    return smartPilot;
}

export function makeShipState(id: string, shipModel: ShipModel) {
    const state = makeShip(id, shipModel.properties);
    state.thrusters = new ArraySchema();
    for (const thrusterConfig of shipModel.thrusters) {
        state.thrusters.push(makeThruster(thrusterConfig));
    }
    state.chainGun = makeChainGun(shipModel.chainGun);
    state.smartPilot = makeSmartPilot(shipModel.smartPilot);

    state.armor = makeArmor(shipModel.armor);
    state.radar = makeRadar(shipModel.radar);
    return state;
}
