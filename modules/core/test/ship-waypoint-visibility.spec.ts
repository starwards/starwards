import { dragonflySF22, makeShipState } from '../src';

import { JsonPointer } from '../src/json-ptr';
import { expect } from 'chai';

describe('ShipState.visiblePilotWaypointCollection', () => {
    it('defaults to null (no collection visible to the pilot)', () => {
        const ship = makeShipState('ship-1', dragonflySF22);
        expect(ship.visiblePilotWaypointCollection).to.equal(null);
    });

    it('is writable via JSON pointer (relay-controlled)', () => {
        const ship = makeShipState('ship-1', dragonflySF22);
        JsonPointer.create('/visiblePilotWaypointCollection').set(ship, 'patrol');
        expect(ship.visiblePilotWaypointCollection).to.equal('patrol');
    });

    it('can be reset to null to hide every collection again', () => {
        const ship = makeShipState('ship-1', dragonflySF22);
        JsonPointer.create('/visiblePilotWaypointCollection').set(ship, 'patrol');
        JsonPointer.create('/visiblePilotWaypointCollection').set(ship, null);
        expect(ship.visiblePilotWaypointCollection).to.equal(null);
    });
});
