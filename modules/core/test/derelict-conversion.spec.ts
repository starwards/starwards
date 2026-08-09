import { Derelict, Faction, SpaceManager, Spaceship, Vec2 } from '../src';

import { expect } from 'chai';

// Behavior tests for issue #2111: an NPC ship's systems-broken death converts it into a
// Derelict at the same position instead of vanishing.

const GENERIC_SHIP_RADIUS = 50;

function tick(spaceMgr: SpaceManager, deltaSeconds = 1) {
    spaceMgr.update({ deltaSeconds, deltaSecondsAvg: deltaSeconds, totalSeconds: deltaSeconds });
}

function makeShip(id: string, x = 0, y = 0, faction = Faction.Raiders) {
    const ship = new Spaceship();
    ship.id = id;
    ship.radius = GENERIC_SHIP_RADIUS;
    ship.position.x = x;
    ship.position.y = y;
    ship.faction = faction;
    ship.callsign = `Raider ${id}`;
    ship.angle = 42;
    ship.velocity.x = 12;
    ship.velocity.y = -7;
    ship.turnSpeed = 15;
    ship.model = 'dragonfly-MK1';
    return ship;
}

describe('SpaceManager.convertToDerelict', () => {
    it('replaces an expendable ship with a Derelict carrying its position, radius, faction, callsign, angle, velocity and turn speed', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('doomed', 100, 200);
        spaceMgr.insert(ship);
        spaceMgr.forceFlushEntities();

        spaceMgr.convertToDerelict('doomed');
        spaceMgr.forceFlushEntities();

        expect(spaceMgr.state.get('doomed')).to.equal(undefined);
        const derelicts = [...spaceMgr.state.getAll('Derelict')];
        expect(derelicts).to.have.lengthOf(1);
        const [derelict] = derelicts;
        expect(derelict.position.x).to.equal(100);
        expect(derelict.position.y).to.equal(200);
        expect(derelict.radius).to.equal(GENERIC_SHIP_RADIUS);
        expect(derelict.faction).to.equal(Faction.Raiders);
        expect(derelict.callsign).to.equal('Raider doomed');
        expect(derelict.angle).to.equal(42);
        expect(derelict.velocity.x).to.be.closeTo(12, 0.01);
        expect(derelict.velocity.y).to.be.closeTo(-7, 0.01);
        expect(derelict.turnSpeed).to.be.closeTo(15, 0.01);
        expect(derelict.model).to.equal('dragonfly-MK1');
    });

    it('queues a destroySpaceshipCommand so the ship room still gets torn down', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.insert(makeShip('doomed'));
        spaceMgr.forceFlushEntities();

        spaceMgr.convertToDerelict('doomed');

        expect(spaceMgr.state.destroySpaceshipCommands).to.include('doomed');
    });

    it('leaves no objectOrder entry behind for the dead ship id (no manager-less leak)', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.insert(makeShip('doomed'));
        spaceMgr.forceFlushEntities();
        spaceMgr.state.botOrderCommands.push({ ids: ['doomed'], order: { type: 'move', position: { x: 1, y: 1 } } });
        tick(spaceMgr, 0.01); // lands the order in the per-object order table

        spaceMgr.convertToDerelict('doomed');
        tick(spaceMgr, 0.01); // gc() runs because a new object (the Derelict) is being inserted

        expect(spaceMgr.resolveObjectOrder('doomed')).to.equal(null);
    });

    it('never converts a non-expendable (player) ship', () => {
        const spaceMgr = new SpaceManager();
        const ship = makeShip('player-ship');
        ship.expendable = false;
        spaceMgr.insert(ship);
        spaceMgr.forceFlushEntities();

        spaceMgr.convertToDerelict('player-ship');

        expect(ship.destroyed).to.equal(false);
        expect([...spaceMgr.state.getAll('Derelict')]).to.have.lengthOf(0);
    });

    it('ignores unknown ids', () => {
        const spaceMgr = new SpaceManager();
        expect(() => spaceMgr.convertToDerelict('no-such-id')).to.not.throw();
    });

    it('is a no-op on an already-destroyed ship', () => {
        const spaceMgr = new SpaceManager();
        spaceMgr.insert(makeShip('doomed'));
        spaceMgr.forceFlushEntities();
        spaceMgr.destroyObject('doomed');

        spaceMgr.convertToDerelict('doomed');

        expect([...spaceMgr.state.getAll('Derelict')]).to.have.lengthOf(0);
    });
});

describe('Derelict', () => {
    it('is identified by Derelict.isInstance', () => {
        const derelict = new Derelict().init(
            'd1',
            Vec2.make({ x: 0, y: 0 }),
            10,
            Faction.Gravitas,
            'Hulk',
            0,
            'dragonfly-MK1',
        );
        expect(Derelict.isInstance(derelict)).to.equal(true);
        expect(Derelict.isInstance(new Spaceship())).to.equal(false);
    });

    it('carries the source ship model for blip identity', () => {
        const derelict = new Derelict().init(
            'd1',
            Vec2.make({ x: 0, y: 0 }),
            10,
            Faction.Gravitas,
            'Hulk',
            0,
            'gravitas',
        );
        expect(derelict.model).to.equal('gravitas');
    });
});
