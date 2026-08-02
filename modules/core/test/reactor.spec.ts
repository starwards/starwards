import { DamageManager, Reactor, SpaceManager, Spaceship, dragonflySF22, makeShipState } from '../src';

import { MockDie } from './ship-test-harness';
import { expect } from 'chai';

describe('Reactor.broken', () => {
    it('is true once effeciencyFactor drifts to a tiny negative value (float precision, not exact zero)', () => {
        const reactor = new Reactor();
        reactor.effeciencyFactor = -3.19e-16;
        expect(reactor.broken).to.equal(true);
    });

    it('is true at exactly zero', () => {
        const reactor = new Reactor();
        reactor.effeciencyFactor = 0;
        expect(reactor.broken).to.equal(true);
    });

    it('is false while still positive', () => {
        const reactor = new Reactor();
        reactor.effeciencyFactor = 0.05;
        expect(reactor.broken).to.equal(false);
    });
});

describe('reactor defect tuning', () => {
    it('breaks the reactor in about 10 defects, since every reactor defect now makes progress', () => {
        const ship = new Spaceship();
        ship.id = 'test-ship';
        const state = makeShipState(ship.id, dragonflySF22);
        const spaceManager = new SpaceManager();
        spaceManager.insert(ship);
        const damageManager = new DamageManager(ship, state, spaceManager, new MockDie()) as unknown as {
            damageReactor(reactor: Reactor): void;
        };
        const reactor = state.reactor;

        let defectCount = 0;
        while (!reactor.broken && defectCount < 100) {
            damageManager.damageReactor(reactor);
            defectCount++;
        }

        expect(defectCount).to.be.within(9, 11);
    });
});
