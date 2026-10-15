import {
    Asteroid,
    Derelict,
    Faction,
    ScanLevel,
    ShipModel,
    SpaceObject,
    XY,
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

/** `count` asteroids (scanned unless `scan` is false) on a 4-wide grid around `center`, `FIELD_SPACING` metres apart. */
function asteroidField(center: { x: number; y: number }, prefix = 'rock', count = 12, scan = true) {
    return Array.from({ length: count }, (_, i) =>
        (scan ? scanned : (o: Asteroid) => o)(
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

/**
 * A scanned field and an unscanned one beside it, across the line of sight from the origin. They are
 * different kinds, so rung 3 keeps two groups, and those overlap: rung 4 collapses them to a POI.
 */
function fieldPair(center: { x: number; y: number }, prefix: string, count: number) {
    const across = XY.scale(XY.normalize({ x: -center.y, y: center.x }), 3_400);
    return [
        ...asteroidField(center, `${prefix}-known`, count),
        ...asteroidField(XY.add(center, across), `${prefix}-unknown`, count, false),
    ];
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

    'dradis-radar-poi-inset': {
        name: 'dradis-radar-poi-inset',
        description:
            'Two adjacent fields (scanned and unscanned) whose groups still overlap: one POI marker, a leader line and one inset',
        async setup(container: HTMLElement) {
            const radar = await dradisScene(container, fieldPair(FIELD_CENTER, 'a', 12));
            return radar.root;
        },
    },

    'dradis-radar-poi-inset-overflow': {
        name: 'dradis-radar-poi-inset-overflow',
        description: 'Three separate super-clusters: three POI markers, insets for the two largest only',
        async setup(container: HTMLElement) {
            const radar = await dradisScene(container, [
                ...fieldPair({ x: 20_000, y: 0 }, 'a', 12),
                ...fieldPair({ x: -10_000, y: 17_000 }, 'b', 8),
                ...fieldPair({ x: -10_000, y: -17_000 }, 'c', 4),
            ]);
            return radar.root;
        },
    },
};
