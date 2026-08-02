import {
    Asteroid,
    Faction,
    SpaceManager,
    Spaceship,
    Vec2,
    getClosestDockingTarget,
    makeShipState,
    shipConfigurations,
} from '../src';

import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];

function makeDockingShipState(faction: Faction) {
    const state = makeShipState('docking-ship', demoShipConfig);
    state.spaceship.faction = faction;
    state.spaceship.position = new Vec2(0, 0);
    return state;
}

function makeCandidateShip(id: string, faction: Faction, position: Vec2, model: keyof typeof shipConfigurations) {
    const ship = new Spaceship();
    ship.id = id;
    ship.faction = faction;
    ship.position = position;
    ship.model = model;
    return ship;
}

describe('getClosestDockingTarget', () => {
    it('returns null when the only nearby candidate is an asteroid', () => {
        const spaceMgr = new SpaceManager();
        const shipState = makeDockingShipState(Faction.Gravitas);
        const asteroid = new Asteroid();
        asteroid.id = 'rock';
        asteroid.position = new Vec2(50, 0);
        asteroid.radius = 100;
        spaceMgr.insert(asteroid);
        spaceMgr.forceFlushEntities();

        expect(getClosestDockingTarget(shipState, spaceMgr.spatialIndex)).to.equal(null);
    });

    it('returns null for a friendly ship that is not a docking host', () => {
        const spaceMgr = new SpaceManager();
        const shipState = makeDockingShipState(Faction.Gravitas);
        const otherShip = makeCandidateShip('friendly-fighter', Faction.Gravitas, new Vec2(50, 0), 'demo-ship');
        spaceMgr.insert(otherShip);
        spaceMgr.forceFlushEntities();

        expect(getClosestDockingTarget(shipState, spaceMgr.spatialIndex)).to.equal(null);
    });

    it('returns null for a hostile-faction docking host', () => {
        const spaceMgr = new SpaceManager();
        const shipState = makeDockingShipState(Faction.Gravitas);
        const enemyStation = makeCandidateShip('enemy-station', Faction.Raiders, new Vec2(50, 0), 'large-station');
        spaceMgr.insert(enemyStation);
        spaceMgr.forceFlushEntities();

        expect(getClosestDockingTarget(shipState, spaceMgr.spatialIndex)).to.equal(null);
    });

    it('returns null for a destroyed friendly station', () => {
        const spaceMgr = new SpaceManager();
        const shipState = makeDockingShipState(Faction.Gravitas);
        const station = makeCandidateShip('dead-station', Faction.Gravitas, new Vec2(50, 0), 'large-station');
        station.destroyed = true;
        spaceMgr.insert(station);
        spaceMgr.forceFlushEntities();

        expect(getClosestDockingTarget(shipState, spaceMgr.spatialIndex)).to.equal(null);
    });

    it('returns a friendly host station in range', () => {
        const spaceMgr = new SpaceManager();
        const shipState = makeDockingShipState(Faction.Gravitas);
        const station = makeCandidateShip('home-station', Faction.Gravitas, new Vec2(50, 0), 'large-station');
        spaceMgr.insert(station);
        spaceMgr.forceFlushEntities();

        expect(getClosestDockingTarget(shipState, spaceMgr.spatialIndex)).to.equal('home-station');
    });

    it('picks the closest friendly host station when several qualify', () => {
        const spaceMgr = new SpaceManager();
        const shipState = makeDockingShipState(Faction.Gravitas);
        const near = makeCandidateShip('near-station', Faction.Gravitas, new Vec2(200, 0), 'large-station');
        const far = makeCandidateShip('far-station', Faction.Gravitas, new Vec2(500, 0), 'large-station');
        spaceMgr.insert(near);
        spaceMgr.insert(far);
        spaceMgr.forceFlushEntities();

        expect(getClosestDockingTarget(shipState, spaceMgr.spatialIndex)).to.equal('near-station');
    });
});
