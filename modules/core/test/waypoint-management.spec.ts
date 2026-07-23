import { SpaceManager, Vec2, Waypoint, spaceCommands } from '../src';

import { JsonPointer } from '../src/json-ptr';
import { expect } from 'chai';

describe('Waypoint management', () => {
    let spaceMgr: SpaceManager;

    beforeEach(() => {
        spaceMgr = new SpaceManager();
    });

    describe('createWaypointOrder with owner', () => {
        it('sets owner on created waypoint when provided', () => {
            const shipId = 'ship-42';
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 100, y: 200 },
                owner: shipId,
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const waypoints = [...spaceMgr.state.getAll('Waypoint')];
            expect(waypoints).to.have.length(1);
            expect(waypoints[0].owner).to.equal(shipId);
        });

        it('owner defaults to null when not provided', () => {
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 0, y: 0 },
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const waypoints = [...spaceMgr.state.getAll('Waypoint')];
            expect(waypoints[0].owner).to.equal(null);
        });

        it('sets title on created waypoint when provided', () => {
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 50, y: 50 },
                title: 'Rendezvous Point',
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const waypoints = [...spaceMgr.state.getAll('Waypoint')];
            expect(waypoints[0].title).to.equal('Rendezvous Point');
        });

        it('sets collection and color on created waypoint when provided', () => {
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 50, y: 50 },
                collection: 'patrol',
                color: 0xff6600,
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const waypoints = [...spaceMgr.state.getAll('Waypoint')];
            expect(waypoints[0].collection).to.equal('patrol');
            expect(waypoints[0].color).to.equal(0xff6600);
        });

        it('visibleToPilot defaults to true when not provided', () => {
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 50, y: 50 },
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const waypoints = [...spaceMgr.state.getAll('Waypoint')];
            expect(waypoints[0].visibleToPilot).to.equal(true);
        });

        it('sets visibleToPilot on created waypoint when provided', () => {
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 50, y: 50 },
                visibleToPilot: false,
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const waypoints = [...spaceMgr.state.getAll('Waypoint')];
            expect(waypoints[0].visibleToPilot).to.equal(false);
        });
    });

    describe('visibleToPilot via JSON pointer (relay-controlled)', () => {
        it('is writable via JSON pointer (tweakable surface)', () => {
            const wp = new Waypoint();
            wp.id = 'wp-1';
            wp.position = new Vec2(0, 0);

            JsonPointer.create('/visibleToPilot').set(wp, false);
            expect(wp.visibleToPilot).to.equal(false);
        });
    });

    describe('waypoint title via JSON pointer', () => {
        it('title is writable via JSON pointer (tweakable surface)', () => {
            const wp = new Waypoint();
            wp.id = 'wp-1';
            wp.position = new Vec2(0, 0);

            JsonPointer.create('/title').set(wp, 'Alpha');
            expect(wp.title).to.equal('Alpha');
        });
    });

    describe('delete waypoint via bulkDeleteOrder', () => {
        it('marks the waypoint as destroyed', () => {
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 0, y: 0 },
                owner: 'ship-1',
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const waypoints = [...spaceMgr.state.getAll('Waypoint')];
            expect(waypoints).to.have.length(1);
            const wpId = waypoints[0].id;

            spaceCommands.bulkDeleteOrder.setValue(spaceMgr.state, { ids: [wpId] });

            expect(spaceMgr.state.get(wpId)?.destroyed).to.equal(true);
        });

        it('is no longer visible in non-destroyed iteration after bulkDeleteOrder', () => {
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 0, y: 0 },
                owner: 'ship-1',
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const wpId = [...spaceMgr.state.getAll('Waypoint')][0].id;

            spaceCommands.bulkDeleteOrder.setValue(spaceMgr.state, { ids: [wpId] });

            const visible = [...spaceMgr.state.getAll('Waypoint')];
            expect(visible).to.have.length(0);
        });
    });

    describe('signals station waypoint ownership filter', () => {
        it('getAll(Waypoint) returns only waypoints owned by this ship when filtered', () => {
            const myShipId = 'ship-signals';
            const otherShipId = 'ship-other';

            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 0, y: 0 },
                owner: myShipId,
            });
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 100, y: 0 },
                owner: otherShipId,
            });
            spaceCommands.createWaypointOrder.setValue(spaceMgr.state, {
                position: { x: 200, y: 0 },
            });
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const myWaypoints = [...spaceMgr.state.getAll('Waypoint')].filter((wp) => wp.owner === myShipId);
            expect(myWaypoints).to.have.length(1);
            expect(myWaypoints[0].owner).to.equal(myShipId);
        });
    });
});
