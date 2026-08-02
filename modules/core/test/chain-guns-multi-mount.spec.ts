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
        die.expectedRoll = 1;
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

        const closeTo = (value: number, target: number) => Math.abs(value - target) < 5;
        expect(projectiles.some((p) => closeTo(p.angle, 0))).to.equal(true); // FWD mount
        expect(projectiles.some((p) => closeTo(p.angle, -90))).to.equal(true); // STBD mount
    });
});
