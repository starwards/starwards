import { ChainGun, Radar, SmartPilot } from '../src';
import { Decoder, Encoder, Schema } from '@colyseus/schema';
import { Magazine } from '../src/ship/magazine';
import { expect } from 'chai';
import { handleGmSetValueCommand } from '../src/commands';

type Broken = Schema & { readonly broken: boolean };

/** What a client (or a snapshot) holds: the server object carried through a real encode/decode. */
function sync<T extends Broken>(server: T, mirror: T): T {
    new Decoder(mirror).decode(new Encoder(server).encodeAll());
    return mirror;
}

/** A server restored from a snapshot: every field, design thresholds included, is now float32. */
function restore<T extends Broken>(fresh: T, mirror: T): T {
    return sync(fresh, mirror);
}

/** Each `server` must be encoded only once: a second `Encoder` over the same state skips its children. */
function expectAgreement<T extends Broken>(server: T, mirror: T, broken: boolean) {
    const client = sync(server, mirror);
    expect({ server: server.broken, client: client.broken }).to.deep.equal({ server: broken, client: broken });
}

function gmSet(root: Schema, path: string, value: number) {
    expect(handleGmSetValueCommand({ path, value }, root)).to.equal(true);
}

const float32 = new Float32Array(1);
const float32Bits = new Int32Array(float32.buffer);

/** The float32 adjacent to positive float32 `x`, one ulp toward zero (-1) or away from it (+1). */
function float32Step(x: number, direction: 1 | -1) {
    float32[0] = x;
    float32Bits[0] += direction;
    return float32[0];
}

describe('broken thresholds read the same through float32 rounding', () => {
    describe('SmartPilot', () => {
        const makePilot = () => {
            const pilot = new SmartPilot();
            pilot.design.offsetBrokenThreshold = 0.6;
            return pilot;
        };
        /** the step `DamageManager.damageSmartPilot` applies per hit */
        const hit = (pilot: SmartPilot, hits: number) => {
            for (let i = 0; i < hits; i++) {
                pilot.offsetFactor += 0.01;
            }
        };

        it('reaching the threshold on a restored server is broken on the server and on clients', () => {
            const server = restore(makePilot(), new SmartPilot());
            hit(server, 60);
            expectAgreement(server, new SmartPilot(), true);
        });

        it('one hit, or one float32 ulp, short of the threshold is intact everywhere', () => {
            const oneHitShort = restore(makePilot(), new SmartPilot());
            hit(oneHitShort, 59);
            expectAgreement(oneHitShort, new SmartPilot(), false);
            const oneUlpShort = restore(makePilot(), new SmartPilot());
            oneUlpShort.offsetFactor = float32Step(oneUlpShort.design.offsetBrokenThreshold, -1);
            expectAgreement(oneUlpShort, new SmartPilot(), false);
        });
    });

    describe('Radar', () => {
        const makeRadar = () => {
            const radar = new Radar();
            radar.design.rangeEaseFactor = 0.08;
            return radar;
        };

        it('a malfunction factor at its own range cap is broken on the server and on clients', () => {
            const server = makeRadar();
            gmSet(server, '/malfunctionRangeFactor', 1);
            expectAgreement(server, new Radar(), true);
        });

        it('one hit, or one float32 ulp, short of the cap is intact everywhere', () => {
            const oneHitShort = makeRadar();
            gmSet(oneHitShort, '/malfunctionRangeFactor', 1);
            oneHitShort.malfunctionRangeFactor -= 0.05;
            expectAgreement(oneHitShort, new Radar(), false);
            const oneUlpShort = makeRadar();
            gmSet(oneUlpShort, '/malfunctionRangeFactor', 1);
            oneUlpShort.malfunctionRangeFactor = float32Step(Math.fround(oneUlpShort.malfunctionRangeFactor), -1);
            expectAgreement(oneUlpShort, new Radar(), false);
        });
    });

    describe('Magazine', () => {
        const makeMagazine = () => {
            const magazine = new Magazine();
            magazine.design.capacityBrokenThreshold = 0.15;
            return magazine;
        };

        it('capacity set to the threshold on a restored server is intact on the server and on clients', () => {
            const server = restore(makeMagazine(), new Magazine());
            gmSet(server, '/capacity', 0.15);
            expectAgreement(server, new Magazine(), false);
        });

        it('one float32 ulp below the threshold is broken everywhere', () => {
            const server = restore(makeMagazine(), new Magazine());
            server.capacity = float32Step(server.design.capacityBrokenThreshold, -1);
            expectAgreement(server, new Magazine(), true);
        });
    });

    describe('Turret', () => {
        const makeChainGun = () => {
            const chainGun = new ChainGun();
            chainGun.design.maxBearingSkew = 45;
            return chainGun;
        };
        /** 1.8 degrees is a roll `DamageManager.damageChainGun` can apply per hit */
        const skew = (turret: ChainGun, hits: number, sign: 1 | -1) => {
            for (let i = 0; i < hits; i++) {
                turret.bearingSkew += 1.8 * sign;
            }
        };

        for (const sign of [1, -1] as const) {
            it(`skew reaching ${sign * 45} degrees is broken on the server and on clients`, () => {
                const server = makeChainGun();
                skew(server, 25, sign);
                expectAgreement(server, new ChainGun(), true);
            });
        }

        it('one hit, or one float32 ulp, short of the maximum skew is intact everywhere', () => {
            const oneHitShort = makeChainGun();
            skew(oneHitShort, 24, 1);
            expectAgreement(oneHitShort, new ChainGun(), false);
            const oneUlpShort = makeChainGun();
            oneUlpShort.bearingSkew = float32Step(oneUlpShort.design.maxBearingSkew, -1);
            expectAgreement(oneUlpShort, new ChainGun(), false);
        });
    });
});
