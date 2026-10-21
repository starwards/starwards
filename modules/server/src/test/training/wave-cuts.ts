import { DockingMode, GameApi, Spaceship, XY } from '@starwards/core/internal';
import { FirstWave, WaveSetup, waveRung } from './wave-rung';

import { STATIONS } from '../../scenarios/wave-defence';
import { TRAINING_PLAYER_ID } from '../../scenarios/training';
import type { TrainingScenario } from './training-scenarios';

/**
 * Scenario cuts of W-waves: short starts that put the crew straight into one known bottleneck, so a
 * single decision lever is measured over a few minutes of sim instead of a whole wave run. Each is the
 * wave_defence map with wave 1 brought in to {@link RAIDER_DISTANCE} of its target and the GVTS placed
 * for the bottleneck; none passes (score them by their continuous wave fitness at the timeout).
 */
const RAIDER_DISTANCE = 25_000;
/** How far off a station the GVTS waits. */
const STANDOFF = 3_000;

/**
 * The ship's space object, the source of truth for position and angle. A setup runs in the map's init,
 * before the space manager flushes its new objects (so `getObject` cannot see them yet): placing the
 * object here places its collision body too.
 */
const mutable = (game: GameApi, id: string) => game.getShip(id)!.spaceObject as Spaceship;

const stationPosition = (id: string) => STATIONS.find((s) => s.id === id)!.position;

function raiderCentre(game: GameApi, { raiderIds }: FirstWave) {
    const sum = raiderIds.reduce<XY>((a, id) => XY.add(a, mutable(game, id).position), XY.zero);
    return XY.scale(sum, 1 / raiderIds.length);
}

/** Moves wave 1 as one body along its bearing, until its centre is `distance` from its target. */
function bringRaidersIn(game: GameApi, wave1: FirstWave, distance: number) {
    const target = stationPosition(wave1.targetId);
    const centre = raiderCentre(game, wave1);
    const offset = XY.difference(centre, target);
    const delta = XY.difference(XY.scale(XY.normalize(offset), distance), offset);
    for (const id of wave1.raiderIds) {
        const raider = mutable(game, id);
        raider.position.setValue(XY.add(raider.position, delta));
    }
}

/** Places the GVTS `standoff` metres from `stationId` on `bearing` (a unit vector from the station). */
function placeGvts(game: GameApi, stationId: string, bearing: XY, standoff: number) {
    const gvts = mutable(game, TRAINING_PLAYER_ID);
    gvts.position.setValue(XY.add(stationPosition(stationId), XY.scale(bearing, standoff)));
    gvts.angle = XY.angleOf(XY.negate(bearing));
}

const otherStations = (targetId: string) => STATIONS.filter((s) => s.id !== targetId);
const towards = (from: XY, to: XY) => XY.normalize(XY.difference(to, from));

/** Raiders in close; then the cut's own placement. */
const cut =
    (place: WaveSetup): WaveSetup =>
    (game, wave1) => {
        bringRaidersIn(game, wave1, RAIDER_DISTANCE);
        place(game, wave1);
    };

/** (a) Intercept timing: the GVTS waits beside another station (the stations are 60 km apart). */
const intercept = cut((game, { targetId }) => {
    const [other] = otherStations(targetId);
    placeGvts(game, other.id, towards(other.position, stationPosition(targetId)), STANDOFF);
});

/** (b) Undock: the GVTS is docked at another station, on its side facing wave 1's target. */
const undock = cut((game, { targetId }) => {
    const [near] = otherStations(targetId);
    const gvts = mutable(game, TRAINING_PLAYER_ID);
    const station = mutable(game, near.id);
    const bearing = towards(near.position, stationPosition(targetId));
    gvts.position.setValue(XY.add(near.position, XY.scale(bearing, station.radius + gvts.radius + 5)));
    const docking = game.getShip(TRAINING_PLAYER_ID)!.state.docking;
    // The docking port faces the station: the ship turns so it lies at the port's angle.
    gvts.angle = XY.angleOf(XY.negate(bearing)) - docking.design.angle;
    docking.targetId = near.id;
    docking.mode = DockingMode.DOCKING;
});

/** (c) Line of fire: the GVTS waits behind wave 1's target, the station between it and the raiders. */
const lineOfFire = cut((game, wave1) => {
    const target = stationPosition(wave1.targetId);
    placeGvts(game, wave1.targetId, towards(raiderCentre(game, wave1), target), STANDOFF);
});

/** Magazine capacity of the capacity-defect cut: just under gravitas's broken threshold (0.15). */
const DEFECT_CAPACITY = 0.135;

/** (d) Magazine defect: the GVTS waits beside wave 1's target, its magazine capacity shot down to 0.135. */
const magazine = cut((game, wave1) => {
    const target = stationPosition(wave1.targetId);
    placeGvts(game, wave1.targetId, towards(target, raiderCentre(game, wave1)), STANDOFF);
    game.getShip(TRAINING_PLAYER_ID)!.state.magazine.capacity = DEFECT_CAPACITY;
});

const cutRung = (name: string, setup: WaveSetup, description: string): TrainingScenario<never> =>
    waveRung({
        name,
        waveIntervalSeconds: 480,
        passWaves: Infinity,
        setup,
        description: `W-waves cut: wave 1 starts ${RAIDER_DISTANCE / 1000} km from its target; ${description}. Never passes: score it by wave fitness at the timeout`,
    }) as TrainingScenario<never>;

export const WAVE_CUTS = {
    'W-cut-intercept': cutRung('W-cut-intercept', intercept, 'the GVTS waits 3 km off another station, 60 km away'),
    'W-cut-undock': cutRung('W-cut-undock', undock, 'the GVTS is docked at another station, 60 km away'),
    'W-cut-lof': cutRung('W-cut-lof', lineOfFire, 'the GVTS waits 3 km behind it, the station in its line of fire'),
    'W-cut-magazine': cutRung(
        'W-cut-magazine',
        magazine,
        `the GVTS waits 3 km off it towards the raiders, magazine capacity ${DEFECT_CAPACITY}`,
    ),
};
