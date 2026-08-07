import { Faction, ShipManagerNpc, SpaceManager, Spaceship, makeShipState, shipConfigurations } from '../src';
import { MockDie, makeIterationsData } from './ship-test-harness';

import { ShipDesign } from '../src/ship/make-ship-state';
import { demoShipChaingun } from '../src/configurations/demo-ship';
import { expect } from 'chai';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

const demoShipConfig = shipConfigurations['demo-ship'];

describe('a ship with multiple chain gun mounts', () => {
    afterEach(() => jest.restoreAllMocks());

    it('fires each mount along its own fitted bearing', () => {
        const twoMountDesign: ShipDesign = {
            ...demoShipConfig,
            chainGuns: [
                ['FWD', demoShipChaingun],
                ['STBD', demoShipChaingun],
            ],
        };
        const spaceMgr = new SpaceManager();
        const shipObj = new Spaceship();
        shipObj.id = 'multi-mount';
        shipObj.faction = Faction.Gravitas;
        const die = new MockDie();
        // 0.5 ⇒ zero-mean aim deviation (die.getGaussian collapses to `mean`), so the fired angle is
        // exactly the mount's fitted bearing instead of a value that merely has to fall within a
        // tolerance band wide enough to absorb unseeded aim jitter.
        die.expectedRoll = 0.5;
        const shipMgr = new ShipManagerNpc(shipObj, makeShipState(shipObj.id, twoMountDesign), spaceMgr, die);
        spaceMgr.insert(shipObj);

        expect(shipMgr.state.chainGuns.length).to.equal(2);
        for (const mount of shipMgr.state.chainGuns) {
            mount.isFiring = true;
            mount.loadAmmo = true;
            switchToAvailableAmmo(mount, shipMgr.state.magazine);
        }

        const i = makeIterationsData(2, 40);
        for (const id of i) {
            shipMgr.update(id);
            spaceMgr.update(id);
        }

        const projectiles = [...spaceMgr.state.getAll('Projectile')];
        expect(projectiles.length).to.be.greaterThan(0);

        expect(projectiles.some((p) => Math.abs(p.angle - 0) < 1e-6)).to.equal(true); // FWD mount
        expect(projectiles.some((p) => Math.abs(p.angle - -90) < 1e-6)).to.equal(true); // STBD mount
    });
});
