import { Armor, ArmorDesign, ArmorPlate } from './armor';
import { ChainGun, ChaingunDesign } from './chain-gun';
import { Magazine, MagazineDesign } from './magazine';
import { Radar, RadarDesign } from './radar';
import { Reactor, ReactorDesign } from './reactor';
import { ShipDirectionConfig, getDirectionFromConfig } from './ship-direction';
import { ShipPropertiesDesign, ShipState } from './ship-state';
import { SmartPilot, SmartPilotDesign } from './smart-pilot';
import { Thruster, ThrusterDesign } from './thruster';

import { ArraySchema } from '@colyseus/schema';
import { Tube } from './tube';

export type ShipDesign = {
    properties: ShipPropertiesDesign;
    chainGun: ChaingunDesign | null;
    tubes: [ShipDirectionConfig, ChaingunDesign][];
    thrusters: [ShipDirectionConfig, ThrusterDesign][];
    armor: ArmorDesign;
    radar: RadarDesign;
    smartPilot: SmartPilotDesign;
    reactor: ReactorDesign;
    magazine: MagazineDesign;
};

function makeThruster(design: ThrusterDesign, angle: ShipDirectionConfig, index: number): Thruster {
    const thruster = new Thruster();
    thruster.index = index;
    thruster.angle = getDirectionFromConfig(angle);
    thruster.design.assign(design);
    return thruster;
}

function makeArmor(design: ArmorDesign): Armor {
    const armor = new Armor();
    armor.armorPlates = new ArraySchema<ArmorPlate>();
    armor.design.assign(design);
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
    state.design.assign(design);
    return state;
}

function makeChainGun(design: ChaingunDesign) {
    const chainGun = new ChainGun();
    chainGun.design.assign(design);
    return chainGun;
}

function makeTube(design: ChaingunDesign, angle: ShipDirectionConfig, index: number) {
    const tube = new Tube();
    tube.index = index;
    tube.angle = getDirectionFromConfig(angle);
    tube.design.assign(design);
    return tube;
}

function makeRadar(design: RadarDesign) {
    const radar = new Radar();
    radar.design.assign(design);
    return radar;
}

function makeMagazine(design: MagazineDesign) {
    const magazine = new Magazine();
    magazine.design.assign(design);
    magazine.cannonShells = magazine.design.maxCannonShells;
    return magazine;
}

function makeReactor(design: ReactorDesign) {
    const reactor = new Reactor();
    reactor.design.assign(design);
    return reactor;
}

function makeSmartPilot(design: SmartPilotDesign) {
    const smartPilot = new SmartPilot();
    smartPilot.design.assign(design);
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
    for (const [index, [angleConfig, tubeConfig]] of design.tubes.entries()) {
        state.tubes.setAt(index, makeTube(tubeConfig, angleConfig, index));
    }
    state.smartPilot = makeSmartPilot(design.smartPilot);

    state.armor = makeArmor(design.armor);
    state.radar = makeRadar(design.radar);
    state.reactor = makeReactor(design.reactor);
    state.magazine = makeMagazine(design.magazine);
    return state;
}
