import { Armor, ArmorDesign, ArmorLayer, ArmorLayerDesign, ArmorPlate } from './armor';
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
import { armorModels, withFaradayLayer } from '../configurations/armor-models';
import { repairProtocols, validateRepairCatalog } from '../configurations/repair-protocols';

import { ArraySchema } from '@colyseus/schema';
import { Tube } from './tube';
import { ammoTypes } from '../space/projectile';

export type ShipDesign = {
    properties: ShipPropertiesDesign;
    chainGuns: [ShipDirectionConfig, ChaingunDesign][];
    tubes: [ShipDirectionConfig, ChaingunDesign][];
    thrusters: [ShipDirectionConfig, ThrusterDesign][];
    armor: ArmorDesign;
    radars: RadarDesign[];
    smartPilot: SmartPilotDesign;
    reactor: ReactorDesign;
    magazine: MagazineDesign;
    weaponsTarget: TargetingDesign;
    warp: WarpDesign | null;
    docking: DockingDesign;
    maneuvering: ManeuveringDesign;
    signals: SignalsDesign;
};

function makeThruster(design: ThrusterDesign, angle: ShipDirectionConfig, index: number): Thruster {
    const thruster = new Thruster();
    thruster.index = index;
    thruster.fittedBearing = getDirectionFromConfig(angle);
    thruster.design.assign(design);
    return thruster;
}

function makeArmorLayer(layer: ArmorLayerDesign): ArmorLayer {
    const stats = armorModels[layer.type];
    const armorLayer = new ArmorLayer();
    armorLayer.design.assign(layer.withFaradayLayer ? withFaradayLayer(stats) : stats);
    armorLayer.design.assign({
        modelName: layer.type,
        plateMaxHealth: layer.plateMaxHealth,
    });
    armorLayer.health = layer.plateMaxHealth;
    return armorLayer;
}

function makeArmor(design: ArmorDesign): Armor {
    if (design.layers.at(-1)?.type !== 'composite') {
        throw new Error('innermost (last) armor layer must be of type composite');
    }
    const armor = new Armor();
    armor.design.assign({ numberOfPlates: design.numberOfPlates });
    armor.armorPlates = new ArraySchema<ArmorPlate>();
    for (let i = 0; i < design.numberOfPlates; i++) {
        const plate = new ArmorPlate();
        for (const layer of design.layers) {
            plate.layers.push(makeArmorLayer(layer));
        }
        armor.armorPlates.push(plate);
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

function makeChainGun(design: ChaingunDesign, angle: ShipDirectionConfig) {
    const chainGun = new ChainGun();
    // bearing is mount-relative (0 = fitted), so simply fitting the mount is enough — nobody is
    // asking it to swing anywhere else yet.
    chainGun.fittedBearing = getDirectionFromConfig(angle);
    chainGun.design.assign(design);
    return chainGun;
}

function makeTube(design: ChaingunDesign, angle: ShipDirectionConfig, index: number) {
    const tube = new Tube();
    tube.index = index;
    tube.fittedBearing = getDirectionFromConfig(angle);
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
    for (const projectileModel of ammoTypes) {
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
    state.chainGuns = new ArraySchema();
    for (const [index, [angleConfig, chainGunConfig]] of design.chainGuns.entries()) {
        state.chainGuns[index] = makeChainGun(chainGunConfig, angleConfig);
    }
    for (const [index, [angleConfig, tubeConfig]] of design.tubes.entries()) {
        state.tubes[index] = makeTube(tubeConfig, angleConfig, index);
    }
    state.smartPilot = makeSmartPilot(design.smartPilot);

    state.armor = makeArmor(design.armor);
    state.radars = new ArraySchema(...design.radars.map(makeRadar));
    state.reactor = makeReactor(design.reactor);
    state.magazine = makeMagazine(design.magazine);
    state.weaponsTarget = makeTargeting(design.weaponsTarget);
    if (design.warp) {
        state.warp = makeWarp(design.warp);
    }
    state.docking = makeDocking(design.docking);
    state.maneuvering = makeManeuvering(design.maneuvering);
    state.signals = makeSignals(design.signals);
    validateRepairCatalog(state, repairProtocols);
    return state;
}
