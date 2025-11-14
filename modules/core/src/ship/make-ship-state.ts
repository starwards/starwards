import { Armor, ArmorDesign, ArmorPlate } from './armor';
import { ChainGun, ChaingunDesign } from './chain-gun';
import { Docking, DockingDesign } from './docking';
import { Magazine, MagazineDesign } from './magazine';
import { Maneuvering, ManeuveringDesign } from './maneuvering';
import { Radar, RadarDesign } from './radar';
import { Reactor, ReactorDesign } from './reactor';
import { ShipDirectionConfig, getDirectionFromConfig } from './ship-direction';
import { ShipPropertiesDesign, ShipState } from './ship-state';
import { SmartPilot, SmartPilotDesign } from './smart-pilot';
import { Targeting, TargetingDesign } from './targeting';
import { Thruster, ThrusterDesign } from './thruster';
import { Warp, WarpDesign } from './warp';

import { ArraySchema } from '@colyseus/schema';
import { Tube } from './tube';
import { projectileModels } from '../space/projectile';

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
    weaponsTarget: TargetingDesign;
    warp: WarpDesign;
    docking: DockingDesign;
    maneuvering: ManeuveringDesign;
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

function makeDocking(design: DockingDesign) {
    const docking = new Docking();
    docking.design.assign(design);
    return docking;
}
function makeManeuvering(design: ManeuveringDesign) {
    const maneuvering = new Maneuvering();
    maneuvering.design.assign(design);
    return maneuvering;
}

function makeWarp(design: WarpDesign) {
    const warp = new Warp();
    warp.design.assign(design);
    return warp;
}

function makeMagazine(design: MagazineDesign) {
    const magazine = new Magazine();
    magazine.design.assign(design);
    for (const projectileModel of projectileModels) {
        magazine[`count_${projectileModel}`] = magazine.design[`max_${projectileModel}`];
    }
    return magazine;
}

function makeTargeting(design: TargetingDesign) {
    const targeting = new Targeting();
    targeting.design.assign(design);
    return targeting;
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
        state.thrusters[index] = makeThruster(thrusterConfig, angleConfig, index);
    }
    if (design.chainGun) {
        state.chainGun = makeChainGun(design.chainGun);
    }
    for (const [index, [angleConfig, tubeConfig]] of design.tubes.entries()) {
        state.tubes[index] = makeTube(tubeConfig, angleConfig, index);
    }
    state.smartPilot = makeSmartPilot(design.smartPilot);

    state.armor = makeArmor(design.armor);
    state.radar = makeRadar(design.radar);
    state.reactor = makeReactor(design.reactor);
    state.magazine = makeMagazine(design.magazine);
    state.weaponsTarget = makeTargeting(design.weaponsTarget);
    state.warp = makeWarp(design.warp);
    state.docking = makeDocking(design.docking);
    state.maneuvering = makeManeuvering(design.maneuvering);
    return state;
}
