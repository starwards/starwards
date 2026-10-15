import {
    Asteroid,
    Faction,
    GameApi,
    GameMap,
    ScanLevel,
    Spaceship,
    Vec2,
    Waypoint,
    XY,
    makeId,
    sectorSize,
} from '@starwards/core/internal';
import { newAsteroid, newShip } from './admin/map-helper';

export { training_t0, training_t1 } from './scenarios/training';
export { wave_defence } from './scenarios/wave-defence';

export const two_vs_one: GameMap = {
    name: 'two_vs_one',
    init: (game: GameApi) => {
        for (let i = 0; i < 20; i++) {
            game.addObject(newAsteroid());
        }
        game.addPlayerSpaceship(newShip('GVTS', Faction.Gravitas, 'gravitas'));
        game.addPlayerSpaceship(newShip('GVTS2', Faction.Gravitas, 'gravitas'));
        const ship2 = game.addNpcSpaceship(newShip('R2D2', Faction.Raiders, 'demo-ship'));
        ship2.setTarget('GVTS');
    },
};

export const solo: GameMap = {
    name: 'solo',
    init: (game: GameApi) => {
        const spaceObject = newShip('GVTS', Faction.Gravitas, 'gravitas');
        game.addPlayerSpaceship(spaceObject);
        spaceObject.position.x = spaceObject.position.y = 0;
        for (let i = 0; i < 20; i++) {
            const wp = new Waypoint();
            wp.id = makeId();
            wp.owner = spaceObject.id;
            wp.collection = i % 2 ? 'route' : 'collection 1';
            wp.color = i % 2 ? 0xffffff : 0x0000ff;
            wp.faction = spaceObject.faction;
            wp.title = `${i}`;
            wp.position = Vec2.Rotate({ x: Math.random() * sectorSize, y: 0 }, Math.random() * 360);
            game.addObject(wp);
        }
    },
};

const testShipId = 'GVTS';
export const test_map_1 = {
    name: 'test_map_1',
    testShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(testShipId, new Vec2(0, 0), 'demo-ship', Faction.Gravitas);
        game.addPlayerSpaceship(spaceObject);
        const asteroidHiddenInRange = new Asteroid().init('astro1', new Vec2(2000, 2000));
        asteroidHiddenInRange.radius = 200;
        game.addObject(asteroidHiddenInRange);
        const asteroidInRange = new Asteroid().init('astro2', new Vec2(1000, 1000));
        asteroidInRange.radius = 350;
        game.addObject(asteroidInRange);
        const asteroidOutOfRange = new Asteroid().init('astro3', new Vec2(3000, -2000));
        asteroidOutOfRange.radius = 50;
        game.addObject(asteroidOutOfRange);
    },
};

export const single_ship = {
    name: 'single_ship',
    testShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(testShipId, new Vec2(0, 0), 'demo-ship', Faction.Gravitas);
        game.addPlayerSpaceship(spaceObject);
    },
};

const multiTubeShipId = 'GVTS-2TUBE';
export const weapons_multi_tube = {
    name: 'weapons_multi_tube',
    testShipId: multiTubeShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(multiTubeShipId, new Vec2(0, 0), 'gravitas', Faction.Gravitas);
        game.addPlayerSpaceship(spaceObject);
    },
};

const noTubesShipId = 'GVTS-0TUBE';
export const weapons_no_tubes = {
    name: 'weapons_no_tubes',
    testShipId: noTubesShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(noTubesShipId, new Vec2(0, 0), 'chaingun-platform', Faction.Gravitas);
        game.addPlayerSpaceship(spaceObject);
    },
};

const multiGunShipId = 'GVTS-3GUN';
export const weapons_multi_gun = {
    name: 'weapons_multi_gun',
    testShipId: multiGunShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(multiGunShipId, new Vec2(0, 0), 'cataphract', Faction.Gravitas);
        game.addPlayerSpaceship(spaceObject);
    },
};

const testTargetShipId = 'GVTS2';
export const two_ships = {
    name: 'two_ships',
    testShipId,
    testTargetShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(testShipId, new Vec2(0, 0), 'demo-ship', Faction.Gravitas);
        game.addPlayerSpaceship(spaceObject);
        const target = new Spaceship().init(testTargetShipId, new Vec2(1000, 0), 'gravitas', Faction.Gravitas);
        game.addPlayerSpaceship(target);
    },
};

/**
 * A row of small asteroids `spacing` m apart, centred on `center` and running across the line of
 * sight from the origin, so none hides another. `scanned` rows are BASIC-scanned by Gravitas.
 */
function addAsteroidRow(game: GameApi, prefix: string, count: number, center: XY, spacing: number, scanned = false) {
    const across = XY.normalize({ x: -center.y, y: center.x });
    for (let i = 0; i < count; i++) {
        const position = XY.add(center, XY.scale(across, (i - (count - 1) / 2) * spacing));
        const rock = new Asteroid().init(`${prefix}-${i}`, new Vec2(position.x, position.y));
        rock.radius = 30;
        if (scanned) rock.scanLevels[Faction.Gravitas] = ScanLevel.BASIC;
        game.addObject(rock);
    }
}

/** Two rows of different visible kind (scanned, unscanned) side by side: their groups overlap into one POI. */
function addFieldPair(game: GameApi, prefix: string, center: XY) {
    const across = XY.normalize({ x: -center.y, y: center.x });
    addAsteroidRow(game, `${prefix}-known`, 12, XY.add(center, XY.scale(across, -350)), 50, true);
    addAsteroidRow(game, `${prefix}-unknown`, 12, XY.add(center, XY.scale(across, 350)), 50);
}

function addDradisTestShip(game: GameApi) {
    game.addPlayerSpaceship(new Spaceship().init(testShipId, new Vec2(0, 0), 'demo-ship', Faction.Gravitas));
}

/** Dradis declutter (SPEC-0007): 12 asteroids that overlap at the default Dradis zoom. */
export const dradis_dense_field = {
    name: 'dradis_dense_field',
    testShipId,
    init: (game: GameApi) => {
        addDradisTestShip(game);
        addAsteroidRow(game, 'rock', 12, { x: 600, y: 0 }, 100);
    },
};

/** Dradis declutter (SPEC-0007 D4): one pair of adjacent fields, collapsing to one POI. */
export const dradis_adjacent_fields = {
    name: 'dradis_adjacent_fields',
    testShipId,
    init: (game: GameApi) => {
        addDradisTestShip(game);
        addFieldPair(game, 'a', { x: 6000, y: 0 });
    },
};

/** Dradis declutter (SPEC-0007 D4): three field pairs, separate POIs once zoomed in to twice the default zoom. */
export const dradis_three_field_pairs = {
    name: 'dradis_three_field_pairs',
    testShipId,
    init: (game: GameApi) => {
        addDradisTestShip(game);
        for (const [prefix, bearing] of [
            ['a', 0],
            ['b', 120],
            ['c', 240],
        ] as const) {
            addFieldPair(game, prefix, XY.byLengthAndDirection(4000, bearing));
        }
    },
};
