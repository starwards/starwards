import {
    Faction,
    Nebula,
    Projectile,
    ScanLevel,
    SpaceObject,
    Vec2,
    XY,
    demoShip,
    makeShipState,
    missileAmmoTypes,
    setOmniRadarSector,
} from '@starwards/core';
import {
    createMockAsteroid,
    createMockDerelict,
    createMockExplosion,
    createMockProjectile,
    createMockShip,
    createMockSpaceDriver,
    createMockWaypoint,
} from '../mocks/space-driver';

import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { createMockShipDriver } from '../mocks/ship-driver';
import { drawDradisRadar } from '../../widgets/dradis-radar';
import { drawHelmsRadar } from '../../widgets/helms-radar';
import { drawLongRangeRadar } from '../../widgets/long-range-radar';
import { drawTacticalRadar } from '../../widgets/tactical-radar';

const PLAYER_FACTION = Faction.Gravitas;
const RANGE = 5000;

function scanned<T extends SpaceObject>(o: T, level: ScanLevel): T {
    o.scanLevels[PLAYER_FACTION] = level;
    return o;
}

function missile(id: string, model: Projectile['model'], position: XY, level: ScanLevel) {
    const p = new Projectile(model);
    p.id = id;
    p.position.x = position.x;
    p.position.y = position.y;
    p.radius = 10;
    return scanned(p, level);
}

/**
 * Every blip type at once (M4.26 ruling): three rows of the six missile warheads at BASIC, SNAPSHOT
 * and FULL, then one row of the other contacts — an unscanned missile, a shell, an asteroid, an
 * enemy ship, a derelict, an explosion, a nebula and a waypoint. `scale` stretches the layout for
 * radars whose reach is wider than the tactical ones.
 */
function allBlips(scale = 1): SpaceObject[] {
    const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
    const rows: [ScanLevel, number][] = [
        [ScanLevel.BASIC, -2400],
        [ScanLevel.SNAPSHOT, -1600],
        [ScanLevel.FULL, -800],
    ];
    const missiles = rows.flatMap(([level, y]) =>
        missileAmmoTypes.map((model, i) => missile(`${model}-${level}`, model, at(-2500 + i * 1000, y), level)),
    );
    const enemy = createMockShip({ id: 'enemy-1', position: at(1500, 1400), angle: 180, faction: Faction.Raiders });
    enemy.radius = 40;
    const shell = createMockProjectile({ id: 'shell-1', position: at(-1500, 1400) });
    shell.radius = 10;
    return [
        ...missiles,
        missile('msl-unknown', 'HiExpMissile', at(-2500, 1400), ScanLevel.UFO),
        shell,
        scanned(createMockAsteroid({ id: 'rock-1', position: at(0, 1400), radius: 100 }), ScanLevel.BASIC),
        scanned(enemy, ScanLevel.BASIC),
        scanned(createMockDerelict({ id: 'wreck-1', position: at(2500, 1400), radius: 60 }), ScanLevel.BASIC),
        createMockExplosion({ id: 'boom-1', position: at(-2000, 2800), radius: 150 }),
        new Nebula().init('nebula-1', Vec2.make(at(0, 3200)), 300 * scale),
        createMockWaypoint({ id: 'waypoint-1', position: at(2000, 2800) }),
    ];
}

function playerShip() {
    const state = makeShipState('player', demoShip);
    state.spaceship.faction = PLAYER_FACTION;
    state.spaceship.callsign = 'Hammer';
    setOmniRadarSector(state.spaceship, 60_000);
    for (const radar of state.radars) {
        radar.power = 1;
    }
    return state;
}

function drivers(container: HTMLElement, scale = 1) {
    const player = playerShip();
    return {
        space: createMockSpaceDriver([player.spaceship, ...allBlips(scale)]) as never,
        ship: createMockShipDriver(player) as never,
        container: createMockContainer(container),
    };
}

export const missilePaintScenes: Record<string, Scene> = {
    'missile-paint-weapons': {
        name: 'missile-paint-weapons',
        description:
            'Weapons tactical radar, every blip type: missiles hollow MSL at BASIC, warhead paint at SNAPSHOT/FULL',
        async setup(container: HTMLElement) {
            const d = drivers(container);
            return await drawTacticalRadar(d.space, d.ship, d.container, { range: RANGE });
        },
    },
    'missile-paint-helms': {
        name: 'missile-paint-helms',
        description: 'Helms radar, every blip type: same missile paint as Weapons',
        async setup(container: HTMLElement) {
            const d = drivers(container);
            return await drawHelmsRadar(d.space, d.ship, d.container);
        },
    },
    'missile-paint-signals': {
        name: 'missile-paint-signals',
        description: 'Signals long-range radar, every blip type: same missile paint as Weapons',
        async setup(container: HTMLElement) {
            const d = drivers(container);
            return await drawLongRangeRadar(d.space, d.ship, d.container, { range: RANGE });
        },
    },
    'missile-paint-dradis': {
        name: 'missile-paint-dradis',
        description: 'Dradis, every blip type: missiles and shells are not shown at all',
        async setup(container: HTMLElement) {
            const d = drivers(container, 20);
            return (await drawDradisRadar(d.space, d.ship, d.container)).root;
        },
    },
};
