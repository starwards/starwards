import { Asteroid, Faction, Spaceship, Vec2, Waypoint, makeId, sectorSize } from '@starwards/core';
import { GameApi, GameMap } from './admin/scripts-api';
import { newAsteroid, newShip } from './admin/map-helper';

export const two_vs_one: GameMap = {
    name: 'two_vs_one',
    init: (game: GameApi) => {
        for (let i = 0; i < 20; i++) {
            game.addObject(newAsteroid());
        }
        game.addSpaceship(newShip('GVTS', Faction.Gravitas, 'dragonfly-SF22'));
        game.addSpaceship(newShip('GVTS2', Faction.Gravitas, 'dragonfly-SF22'));
        const ship2 = game.addSpaceship(newShip('R2D2', Faction.Raiders, 'dragonfly-SF22'));
        ship2.setTarget('GVTS');
        // bManager.bot = jouster();
    },
};

export const solo: GameMap = {
    name: 'solo',
    init: (game: GameApi) => {
        const ship = game.addSpaceship(newShip('GVTS', Faction.Gravitas, 'dragonfly-SF22'));
        ship.spaceObject.position.x = ship.spaceObject.position.y = 0;
        for (let i = 0; i < 20; i++) {
            const wp = new Waypoint();
            wp.id = makeId();
            wp.owner = ship.spaceObject.id;
            wp.collection = i % 2 ? 'route' : 'collection 1';
            wp.color = i % 2 ? 0xffffff : 0x0000ff;
            wp.faction = ship.spaceObject.faction;
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
        const ship = new Spaceship().init(testShipId, new Vec2(0, 0), 'dragonfly-SF22', Faction.Gravitas);
        game.addSpaceship(ship);
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
