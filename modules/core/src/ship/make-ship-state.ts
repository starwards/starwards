import { Armor, ArmorDesign, ArmorPlate } from './armor';
import { ChainGun, ChaingunDesign } from './chain-gun';
import { Radar, RadarDesign } from './radar';
import { Reactor, ReactorDesign } from './reactor';
import { ShipDirectionConfig, getDirectionFromConfig } from './ship-direction';
import { ShipPropertiesDesign, ShipState } from './ship-state';
import { SmartPilot, SmartPilotDesign } from './smart-pilot';
import { Thruster, ThrusterDesign } from './thruster';

import { ArraySchema } from '@colyseus/schema';
import { ModelParams } from '../model-params';

export type ShipDesign = {
    properties: ShipPropertiesDesign;
    chainGun: ChaingunDesign | null;
    thrusters: [ShipDirectionConfig, ThrusterDesign][];
    armor: ArmorDesign;
    radar: RadarDesign;
    smartPilot: SmartPilotDesign;
    reactor: ReactorDesign;
};

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
    chainGun.design.assign(design);
    // Object.assign(chainGun.design, design);
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
