import { ANGLE_QUANTUM_DEGREES, degToRad } from '../logic/formulas';
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
import { MIN_RADAR_DETECT_FACTOR } from '../logic/field-of-view';
import { Tube } from './tube';
import { ammoTypes } from '../space/projectile';
import { validateTurretDesign } from './turret';

/**
 * Today's station omni-radar perimeter (metres). The scenario's wave-warning model assumes every
 * hull is detectable before a contact reaches it, so every hull's `radius` must clear this line.
 */
const STATION_RADAR_PERIMETER = 120_000;

/**
 * Radius (metres) at which a hull becomes detectable exactly at `STATION_RADAR_PERIMETER`, per the
 * field-of-view gate in `logic/field-of-view.ts`
 * (`object.radius > MIN_RADAR_DETECT_FACTOR * Math.sqrt(distance)`). A hull at or below this line
 * is invisible inside the perimeter the warning model is built on.
 */
export const MIN_HULL_RADIUS = MIN_RADAR_DETECT_FACTOR * Math.sqrt(STATION_RADAR_PERIMETER);

/**
 * Radius (metres) below which a hull's angular width at `STATION_RADAR_PERIMETER` rounds away to
 * nothing under `limitPercisionHard`'s quantum (`logic/formulas.ts`) — the sweep in
 * `logic/field-of-view.ts` builds its arcs from rounded endpoints, so a hull this small is
 * invisible there regardless of the radius gate. This is the *binding* constraint on long-range
 * detection (larger than `MIN_HULL_RADIUS`): derived from `ANGLE_QUANTUM_DEGREES` so a future
 * change to the rounding quantum or the perimeter moves this floor with it.
 */
export const MIN_HULL_RADIUS_ANGULAR = (ANGLE_QUANTUM_DEGREES * STATION_RADAR_PERIMETER * degToRad) / 2;

/**
 * A hull invisible inside the station's own omni-radar perimeter would silently break the
 * scenario's wave-warning model (SPEC pattern: same as `validateRepairCatalog` / `validateTurretDesign`).
 */
export function validateHullRadius(radius: number, context: string): void {
    if (radius <= MIN_HULL_RADIUS) {
        throw new Error(
            `hull "${context}" radius (${radius}m) is at or below the detectability floor ` +
                `(${MIN_HULL_RADIUS.toFixed(2)}m) for the ${STATION_RADAR_PERIMETER / 1000}km station radar perimeter`,
        );
    }
    if (radius <= MIN_HULL_RADIUS_ANGULAR) {
        throw new Error(
            `hull "${context}" radius (${radius}m) is at or below the angular-resolvability floor ` +
                `(${MIN_HULL_RADIUS_ANGULAR.toFixed(2)}m) for the ${STATION_RADAR_PERIMETER / 1000}km station radar perimeter — ` +
                `its angular width there rounds below the ${ANGLE_QUANTUM_DEGREES}-degree precision quantum`,
        );
    }
}

export type ShipDesign = {
    /**
     * Hull radius in metres. Sets radar detection range and blip size (`logic/field-of-view.ts`)
     * and collision/docking geometry (`space/space-object-base.ts`). A decided per-hull value,
     * never derived from armor plate count at runtime.
     */
    radius: number;
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
    validateTurretDesign(thruster.design, `thruster ${index} (${angle})`);
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
    validateTurretDesign(chainGun.design, `chain gun (${angle})`);
    return chainGun;
}

function makeTube(design: ChaingunDesign, angle: ShipDirectionConfig, index: number) {
    const tube = new Tube();
    tube.index = index;
    tube.fittedBearing = getDirectionFromConfig(angle);
    tube.design.assign(design);
    validateTurretDesign(tube.design, `tube ${index} (${angle})`);
    return tube;
}

function makeRadar(design: RadarDesign, index: number) {
    const radar = new Radar();
    radar.design.assign(design);
    validateTurretDesign(radar.design, `radar ${index}`);
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
    validateHullRadius(design.radius, design.properties.modelName ?? id);
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
    state.radars = new ArraySchema(...design.radars.map((radarDesign, index) => makeRadar(radarDesign, index)));
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
