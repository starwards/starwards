import { ShipDie } from '../src/ship/ship-die';
import { expect } from 'chai';
import { setRngPin } from '../src/logic/rng-pin';

const WINDOW = 3;

function rollAfter(seconds: number, id: string) {
    const die = new ShipDie(99);
    die.update({ deltaSeconds: seconds, deltaSecondsAvg: seconds, totalSeconds: seconds });
    return die.getRoll(id);
}

describe('rng pin (M4.78)', () => {
    afterEach(() => setRngPin(undefined));

    it('default: an event roll changes when its salt window changes', () => {
        expect(rollAfter(0, 'pickSystem:x')).not.to.equal(rollAfter(WINDOW + 1, 'pickSystem:x'));
    });

    it('salt pin: every event roll is independent of the window', () => {
        setRngPin('salt');
        expect(rollAfter(0, 'pickSystem:x')).to.equal(rollAfter(WINDOW + 1, 'pickSystem:x'));
    });

    it('a per-source pin only fixes its own rolls', () => {
        setRngPin('aim');
        expect(rollAfter(0, 's:m:aim:3')).to.equal(rollAfter(WINDOW + 1, 's:m:aim:3'));
        expect(rollAfter(0, 'pickSystem:x')).not.to.equal(rollAfter(WINDOW + 1, 'pickSystem:x'));
    });

    it('defect pin covers defect rolls and effects, not system picks', () => {
        setRngPin('defect');
        for (const id of ['defect:d1:0:chainGun:0', 'damageSignalsdefect:d1', 'thrusterAngleOffsetdefect:d1']) {
            expect(rollAfter(0, id)).to.equal(rollAfter(WINDOW + 1, id));
        }
        expect(rollAfter(0, 'pickSystem:x')).not.to.equal(rollAfter(WINDOW + 1, 'pickSystem:x'));
    });

    it('rejects an unknown name', () => {
        expect(() => setRngPin('aim,bogus')).to.throw('unknown RNG pin');
    });
});
