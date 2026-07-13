import { Armor, ArmorDesign, ArmorLayer, ArmorPlate } from './armor';
import { ChainGun, ChaingunDesign } from './chain-gun';
import { Docking, DockingDesign } from './docking';
import { Magazine, MagazineDesign } from './magazine';
import { Maneuvering, ManeuveringDesign } from './maneuvering';
import { Radar, RadarDesign } from './radar';
import { Reactor, ReactorDesign } from './reactor';
import { ShipDirectionConfig, getDirectionFromConfig } from './ship-direction';
import { ShipPropertiesDesign, ShipState } from './ship-state';
import { Signals, SignalsDesign } from './signals';
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
    // a single Composite-base design, or a stack ordered outermost-first with the base last
    armor: ArmorDesign | ArmorDesign[];
    radar: RadarDesign;
    smartPilot: SmartPilotDesign;
    reactor: ReactorDesign;
    magazine: MagazineDesign;
    weaponsTarget: TargetingDesign;
    warp: WarpDesign;
    docking: DockingDesign;
    maneuvering: ManeuveringDesign;
    signals: SignalsDesign;
};

function makeThruster(design: ThrusterDesign, angle: ShipDirectionConfig, index: number): Thruster {
    const thruster = new Thruster();
    thruster.index = index;
    thruster.angle = getDirectionFromConfig(angle);
    thruster.design.assign(design);
    return thruster;
}

function makePlates(target: ArmorLayer, design: ArmorDesign) {
    target.armorPlates = new ArraySchema<ArmorPlate>();
    target.design.assign(design);
    for (let i = 0; i < design.numberOfPlates; i++) {
        const plate = new ArmorPlate();
        plate.health = plate.maxHealth = design.plateMaxHealth;
        target.armorPlates.push(plate);
    }
}

// Builds a ship's armor stack. Accepts a single Composite-base design, or a stack ordered
// outermost-first with the mandatory base (innermost) last. The returned Armor is the base
// hull; extra layers become coats stacked outside it.
export function makeArmor(design: ArmorDesign | ArmorDesign[]): Armor {
    const designs = Array.isArray(design) ? design : [design];
    const baseDesign = designs[designs.length - 1];
    const coatDesigns = designs.slice(0, -1); // outermost-first
    const armor = new Armor();
    armor.coats = new ArraySchema<ArmorLayer>();
    makePlates(armor, baseDesign);
    for (const coatDesign of coatDesigns) {
        const coat = new ArmorLayer();
        makePlates(coat, coatDesign);
        armor.coats.push(coat);
    }
    return armor;
}

function makeShip(id: string, design: ShipPropertiesDesign) {
    const state = new ShipState();
    // Both state.id and state.spaceship.id must match: state.id is used for
    // room identity and JSON Pointer lookups, spaceship.id is the Colyseus
    // schema mirror synced to clients.
    state.id = id;
    state.spaceship.id = id;
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

function makeSignals(design: SignalsDesign) {
    const signals = new Signals();
    signals.design.assign(design);
    return signals;
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
    state.signals = makeSignals(design.signals);
    return state;
}
