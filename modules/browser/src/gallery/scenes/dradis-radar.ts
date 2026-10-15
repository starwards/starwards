import {
    Derelict,
    Faction,
    ScanLevel,
    ShipModel,
    SpaceObject,
    demoShip,
    makeShipState,
    setOmniRadarSector,
} from '@starwards/core';
import { createMockAsteroid, createMockDerelict, createMockSpaceDriver } from '../mocks/space-driver';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawDradisRadar } from '../../widgets/dradis-radar';

const PLAYER_FACTION = Faction.Gravitas;

function createShip(id: string, x: number, y: number, faction: Faction, angle: number, model: ShipModel = 'demo-ship') {
    const state = makeShipState(id, demoShip);
    state.spaceship.position.x = x;
    state.spaceship.position.y = y;
    state.spaceship.angle = angle;
    state.spaceship.faction = faction;
    state.spaceship.model = model;
    // the template hull is too small for another ship's radar to detect at Dradis distances
    state.spaceship.radius = 40;
    setOmniRadarSector(state.spaceship, 60_000);
    for (const radar of state.radars) {
        radar.power = 1;
    }
    return state;
}

function scanned<T extends SpaceObject>(o: T, level = ScanLevel.BASIC): T {
    o.scanLevels[PLAYER_FACTION] = level;
    return o;
}

const FIELD_CENTER = { x: 12_000, y: 6_000 };
const FIELD_SPACING = 1_200;

/** 12 scanned asteroids on a 4x3 grid around `center`, `FIELD_SPACING` metres apart. */
function asteroidField(center: { x: number; y: number }, prefix = 'rock') {
    return Array.from({ length: 12 }, (_, i) =>
        scanned(
            createMockAsteroid({
                id: `${prefix}-${i}`,
                position: {
                    x: center.x + ((i % 4) - 1.5) * FIELD_SPACING,
                    y: center.y + (Math.floor(i / 4) - 1) * FIELD_SPACING,
                },
                radius: 200,
            }),
        ),
    );
}

/** Draws the real Dradis widget around a player ship at the origin; `others` are the remaining contacts. */
async function dradisScene(container: HTMLElement, others: SpaceObject[]) {
    const player = createShip('player', 0, 0, PLAYER_FACTION, 0);
    player.spaceship.callsign = 'Hammer';
    const radar = await drawDradisRadar(
        createMockSpaceDriver([player.spaceship, ...others]) as never,
        createMockShipDriver(player) as never,
        createMockContainer(container),
    );
    return radar;
}

export const dradisRadarScenes: Record<string, Scene> = {
    'dradis-radar-ships': {
        name: 'dradis-radar-ships',
        description:
            'Dradis with ships at several headings: no heading sprite, labels are callsigns, unscanned contact unlabelled',
        async setup(container: HTMLElement) {
            const enemy = createShip('enemy-1', 15_000, -10_000, Faction.Raiders, 135).spaceship;
            enemy.callsign = 'Viper';
            const neutral = createShip('neutral-1', -20_000, 12_000, Faction.NONE, 270, 'large-station').spaceship;
            neutral.callsign = 'Haven';
            const unknown = createShip('unknown-1', 25_000, 15_000, Faction.Raiders, 45).spaceship;
            const wreck: Derelict = createMockDerelict({
                id: 'derelict-1',
                position: { x: -15_000, y: -18_000 },
                callsign: 'Hulk',
                model: 'dragonfly-MK1',
            });
            const rock = createMockAsteroid({ id: 'asteroid-1', position: { x: 5_000, y: 22_000 }, radius: 300 });
            const radar = await dradisScene(container, [
                scanned(enemy),
                scanned(neutral),
                unknown,
                scanned(wreck),
                scanned(rock),
            ]);
            return radar.root;
        },
    },

    'dradis-radar-dense-field': {
        name: 'dradis-radar-dense-field',
        description:
            'Dradis at default zoom over a 12-asteroid field: one group icon with a <100 badge; a named ship inside stays individual and full size',
        async setup(container: HTMLElement) {
            const viper = createShip('enemy-1', FIELD_CENTER.x - 3_000, FIELD_CENTER.y, Faction.Raiders, 135).spaceship;
            viper.callsign = 'Viper';
            const radar = await dradisScene(container, [scanned(viper), ...asteroidField(FIELD_CENTER)]);
            return radar.root;
        },
    },

    'dradis-radar-dense-zoomed': {
        name: 'dradis-radar-dense-zoomed',
        description:
            'The same field zoomed in until the asteroids no longer overlap: every asteroid drawn individually',
        async setup(container: HTMLElement) {
            const viper = createShip('enemy-1', FIELD_CENTER.x - 3_000, FIELD_CENTER.y, Faction.Raiders, 135).spaceship;
            viper.callsign = 'Viper';
            const radar = await dradisScene(container, [scanned(viper), ...asteroidField(FIELD_CENTER)]);
            radar.follow.setFollow(false);
            radar.root.camera.set(FIELD_CENTER);
            radar.root.camera.setZoom(0.08);
            return radar.root;
        },
    },
};
