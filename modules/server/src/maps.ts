import {
    Asteroid,
    Faction,
    GameApi,
    GameMap,
    Spaceship,
    Vec2,
    Waypoint,
    makeId,
    sectorSize,
} from '@starwards/core/internal';
import { newAsteroid, newShip } from './admin/map-helper';

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

const multiGunShipId = 'GVTS-3GUN';
export const weapons_multi_gun = {
    name: 'weapons_multi_gun',
    testShipId: multiGunShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(multiGunShipId, new Vec2(0, 0), 'cataphract', Faction.Gravitas);
        game.addPlayerSpaceship(spaceObject);
    },
};

const zeroTubeShipId = 'GVTS-NOTUBES';
export const weapons_zero_tubes = {
    name: 'weapons_zero_tubes',
    testShipId: zeroTubeShipId,
    init: (game: GameApi) => {
        const spaceObject = new Spaceship().init(zeroTubeShipId, new Vec2(0, 0), 'dragonfly-MK1', Faction.Gravitas);
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
