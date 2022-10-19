import { Armor, ArmorPlate } from './armor';
import {
    ArmorModel,
    ChaingunModel,
    RadarModel,
    ReactorModel,
    ShipDirectionConfig,
    ShipModel,
    ShipPropertiesModel,
    SmartPilotModel,
    ThrusterModel,
} from './ship-configuration';
import { ChainGun, ShipState, SmartPilot } from '..';

import { ArraySchema } from '@colyseus/schema';
import { ModelParams } from '../model-params';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { Thruster } from './thruster';
import { getDirectionFromConfig } from '.';

function makeThruster(model: ThrusterModel, angle: ShipDirectionConfig, index: number): Thruster {
    const thruster = new Thruster();
    thruster.index = index;
    thruster.angle = getDirectionFromConfig(angle);
    thruster.modelParams = new ModelParams(model);
    return thruster;
}

function makeArmor(model: ArmorModel): Armor {
    const armor = new Armor();
    armor.armorPlates = new ArraySchema<ArmorPlate>();
    armor.modelParams = new ModelParams(model);
    for (let i = 0; i < model.numberOfPlates; i++) {
        const plate = new ArmorPlate();
        plate.health = plate.maxHealth = model.plateMaxHealth;
        armor.armorPlates.push(plate);
    }
    return armor;
}

function makeShip(id: string, model: ShipPropertiesModel) {
    const state = new ShipState();
    state.id = id;
    state.modelParams = new ModelParams(model);
    state.chainGunAmmo = state.maxChainGunAmmo;
    return state;
}

function makeChainGun(model: ChaingunModel) {
    const chainGun = new ChainGun();
    chainGun.modelParams = new ModelParams(model);
    chainGun.shellSecondsToLive = 0;
    return chainGun;
}

function makeRadar(model: RadarModel) {
    const radar = new Radar();
    radar.modelParams = new ModelParams(model);
    return radar;
}

function makeReactor(model: ReactorModel) {
    const reactor = new Reactor();
    reactor.modelParams = new ModelParams(model);
    return reactor;
}

function makeSmartPilot(model: SmartPilotModel) {
    const smartPilot = new SmartPilot();
    smartPilot.modelParams = new ModelParams(model);
    return smartPilot;
}

export function makeShipState(id: string, model: ShipModel) {
    const state = makeShip(id, model.properties);
    state.thrusters = new ArraySchema();
    for (const [index, [angleConfig, thrusterConfig]] of model.thrusters.entries()) {
        state.thrusters.setAt(index, makeThruster(thrusterConfig, angleConfig, index));
    }
    if (model.chainGun) {
        state.chainGun = makeChainGun(model.chainGun);
    }
    state.smartPilot = makeSmartPilot(model.smartPilot);

    state.armor = makeArmor(model.armor);
    state.radar = makeRadar(model.radar);
    state.reactor = makeReactor(model.reactor);
    return state;
}
