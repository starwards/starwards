import { Armor, ArmorPlate } from './armor';
import {
    ArmorDesign,
    ChaingunDesign,
    RadarDesign,
    ReactorDesign,
    ShipDesign,
    ShipDirectionConfig,
    ShipPropertiesDesign,
    SmartPilotDesign,
    ThrusterDesign,
} from './ship-configuration';
import { ChainGun, ShipState, SmartPilot } from '..';

import { ArraySchema } from '@colyseus/schema';
import { ModelParams } from '../model-params';
import { Radar } from './radar';
import { Reactor } from './reactor';
import { Thruster } from './thruster';
import { getDirectionFromConfig } from '.';

function makeThruster(design: ThrusterDesign, angle: ShipDirectionConfig, index: number): Thruster {
    const thruster = new Thruster();
    thruster.index = index;
    thruster.angle = getDirectionFromConfig(angle);
    thruster.modelParams = new ModelParams(design);
    return thruster;
}

function makeArmor(design: ArmorDesign): Armor {
    const armor = new Armor();
    armor.armorPlates = new ArraySchema<ArmorPlate>();
    armor.modelParams = new ModelParams(design);
    for (let i = 0; i < design.numberOfPlates; i++) {
        const plate = new ArmorPlate();
        plate.health = plate.maxHealth = design.plateMaxHealth;
        armor.armorPlates.push(plate);
    }
    return armor;
}

function makeShip(id: string, design: ShipPropertiesDesign) {
    const state = new ShipState();
    state.id = id;
    state.modelParams = new ModelParams(design);
    state.chainGunAmmo = state.maxChainGunAmmo;
    return state;
}

function makeChainGun(design: ChaingunDesign) {
    const chainGun = new ChainGun();
    chainGun.modelParams = new ModelParams(design);
    chainGun.shellSecondsToLive = 0;
    return chainGun;
}

function makeRadar(model: RadarDesign) {
    const radar = new Radar();
    radar.modelParams = new ModelParams(model);
    return radar;
}

function makeReactor(design: ReactorDesign) {
    const reactor = new Reactor();
    reactor.modelParams = new ModelParams(design);
    return reactor;
}

function makeSmartPilot(design: SmartPilotDesign) {
    const smartPilot = new SmartPilot();
    smartPilot.modelParams = new ModelParams(design);
    return smartPilot;
}

export function makeShipState(id: string, design: ShipDesign) {
    const state = makeShip(id, design.properties);
    state.thrusters = new ArraySchema();
    for (const [index, [angleConfig, thrusterConfig]] of design.thrusters.entries()) {
        state.thrusters.setAt(index, makeThruster(thrusterConfig, angleConfig, index));
    }
    if (design.chainGun) {
        state.chainGun = makeChainGun(design.chainGun);
    }
    state.smartPilot = makeSmartPilot(design.smartPilot);

    state.armor = makeArmor(design.armor);
    state.radar = makeRadar(design.radar);
    state.reactor = makeReactor(design.reactor);
    return state;
}
