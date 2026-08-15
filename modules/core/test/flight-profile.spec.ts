import {
    ChaingunDesign,
    FlightDoctrine,
    ShipDesign,
    ShipDirectionConfig,
    Spaceship,
    ThrusterDesign,
    XY,
    chaingunPlatformChaingun,
    demoShipThruster,
    makeFlightProfile,
    makeShipState,
    shipConfigurations,
} from '../src';

import { expect } from 'chai';

const demoShipConfig = shipConfigurations['demo-ship'];
const stationConfig = shipConfigurations['chaingun-platform'];

/** A hull with two chain-guns: a PORT-fitted bolted mount and a FWD-fitted full-traverse turret. */
function boltedAndTurretConfig(): ShipDesign {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [
        ['PORT', { ...chaingunPlatformChaingun, bearingLimit: 0, turnSpeed: 0 }],
        ['FWD', { ...chaingunPlatformChaingun, maxShellRange: 20_000 }],
    ];
    return { ...stationConfig, chainGuns, thrusters: [] };
}

/** A single PORT-fitted bolted mount, and an asymmetric thruster layout: 2 FWD, 1 PORT, 1 STBD. */
function boltedGunAsymmetricThrustConfig(): ShipDesign {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [
        ['PORT', { ...chaingunPlatformChaingun, bearingLimit: 0, turnSpeed: 0 }],
    ];
    const thrusters: [ShipDirectionConfig, ThrusterDesign][] = [
        ['FWD', demoShipThruster],
        ['FWD', demoShipThruster],
        ['PORT', demoShipThruster],
        ['STBD', demoShipThruster],
    ];
    return { ...demoShipConfig, chainGuns, thrusters };
}

/** A full-traverse turret only, with an asymmetric thruster layout: 2 FWD, 1 PORT, 1 STBD. */
function turretOnlyAsymmetricThrustConfig(): ShipDesign {
    const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [['FWD', chaingunPlatformChaingun]];
    const thrusters: [ShipDirectionConfig, ThrusterDesign][] = [
        ['FWD', demoShipThruster],
        ['FWD', demoShipThruster],
        ['PORT', demoShipThruster],
        ['STBD', demoShipThruster],
    ];
    return { ...demoShipConfig, chainGuns, thrusters };
}

function makeTarget(position: XY, velocity: XY = XY.zero) {
    const target = new Spaceship();
    target.position.setValue(position);
    target.velocity.setValue(velocity);
    return target;
}

describe('flight-profile', () => {
    describe('trackRange', () => {
        it('spans the min/max shell range across every mount, not just the first', () => {
            const state = makeShipState('1', boltedAndTurretConfig());
            const profile = makeFlightProfile(state, FlightDoctrine.INTERCEPT);

            const [min, max] = profile.trackRange();

            expect(min).to.equal(chaingunPlatformChaingun.minShellRange);
            expect(max).to.equal(20_000); // the second (FWD turret) mount's longer range
        });

        it('ignores the gun envelope entirely under SHADOW', () => {
            const state = makeShipState('1', boltedAndTurretConfig());
            const profile = makeFlightProfile(state, FlightDoctrine.SHADOW);

            expect(profile.trackRange()).to.deep.equal([1000, 3000]);
        });
    });

    describe('isReachable', () => {
        it('uses the ship-wide max shell range, not chainGuns[0]', () => {
            // chainGuns[0] (PORT, bolted) only reaches to the platform default; chainGuns[1] (the
            // FWD turret) reaches to 20,000 — this is the exact regression that motivated the redesign.
            const state = makeShipState('1', boltedAndTurretConfig());
            const profile = makeFlightProfile(state, FlightDoctrine.STANDOFF);
            const target = makeTarget({ x: 15_000, y: 0 });

            expect(profile.isReachable(target, 15_000)).to.equal(true);
        });

        it('rejects a target beyond every mount’s max range', () => {
            const state = makeShipState('1', boltedAndTurretConfig());
            const profile = makeFlightProfile(state, FlightDoctrine.STANDOFF);
            const target = makeTarget({ x: 25_000, y: 0 });

            expect(profile.isReachable(target, 25_000)).to.equal(false);
        });

        it('is always false with no chain guns', () => {
            const state = makeShipState('1', { ...stationConfig, chainGuns: [] });
            const profile = makeFlightProfile(state, FlightDoctrine.STANDOFF);
            const target = makeTarget({ x: 1000, y: 0 });

            expect(profile.isReachable(target, 100)).to.equal(false);
        });
    });

    describe('headingOffset', () => {
        it('parks a bolted mount on the firing line (-fittedBearing) under INTERCEPT, independent of the target', () => {
            const state = makeShipState('1', boltedGunAsymmetricThrustConfig());
            state.spaceship.angle = 0;
            const profile = makeFlightProfile(state, FlightDoctrine.INTERCEPT);
            // Dead ahead — nowhere near the mount's own PORT bearing, so this only passes if
            // heading is driven by the mount's fitting, not the target's position.
            const target = makeTarget({ x: 10_000, y: 0 });

            // The mount is fitted PORT (fittedBearing 90); parking it on the target needs
            // headingOffset -90 regardless of where the target actually is.
            expect(profile.headingOffset(target)).to.equal(-90);
        });

        it('matches today’s single-mount behavior on a symmetric hull (regression guard)', () => {
            // dragonfly-style: one bolted mount, symmetric thrust in every direction. INTERCEPT
            // must still park the gun on the firing line the same way pre-redesign did.
            const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [
                ['PORT', { ...chaingunPlatformChaingun, bearingLimit: 0, turnSpeed: 0 }],
            ];
            const thrusters: [ShipDirectionConfig, ThrusterDesign][] = [
                ['FWD', demoShipThruster],
                ['AFT', demoShipThruster],
                ['PORT', demoShipThruster],
                ['STBD', demoShipThruster],
            ];
            const state = makeShipState('1', { ...demoShipConfig, chainGuns, thrusters });
            state.spaceship.angle = 0;
            const profile = makeFlightProfile(state, FlightDoctrine.INTERCEPT);
            const target = makeTarget({ x: 0, y: -10_000 }); // dead abeam, STBD side

            expect(profile.headingOffset(target)).to.equal(-90);
        });

        it('prefers the strong thrust axis over a turret’s incidental bearing under STANDOFF', () => {
            const state = makeShipState('1', turretOnlyAsymmetricThrustConfig());
            state.spaceship.angle = 0;
            const profile = makeFlightProfile(state, FlightDoctrine.STANDOFF);
            // Target dead abeam (PORT) and closing fast along the ship's own -x (global) axis:
            // the ship's own 2x-capacity FWD/AFT axis should win over pointing the nose straight
            // at the target, since the lone mount is a full-traverse turret that never
            // constrains heading. Rotating 90° puts the FWD/AFT axis along the closing velocity.
            const target = makeTarget({ x: 0, y: 1 }, { x: -5000, y: 0 });

            expect(profile.headingOffset(target)).to.equal(90);
        });

        it('is aim-only when the ship has no thrusters at all (stations)', () => {
            const state = makeShipState('1', boltedAndTurretConfig());
            state.spaceship.angle = 0;
            const profile = makeFlightProfile(state, FlightDoctrine.STANDOFF);
            const target = makeTarget({ x: 10_000, y: 0 });

            // Only the bolted PORT mount constrains heading; the FWD turret never does.
            // thrustCost is 0 everywhere (no thrusters), so the bolted mount's own offset must
            // still win, independent of the target's actual position.
            expect(profile.headingOffset(target)).to.equal(-90);
        });

        it('does not chatter when the target bearing sits right on a tie between two candidates', () => {
            // A lone full-traverse turret contributes zero aimCost everywhere, and symmetric
            // thrust ties FWD/PORT exactly at a 45° bearing — the worst case for oscillation.
            // Without the hysteresis margin, alternating ±1° around the tie flips the winner on
            // every call; with it, the profile should stick to whichever it picked first.
            const chainGuns: [ShipDirectionConfig, ChaingunDesign][] = [['FWD', chaingunPlatformChaingun]];
            const thrusters: [ShipDirectionConfig, ThrusterDesign][] = [
                ['FWD', demoShipThruster],
                ['AFT', demoShipThruster],
                ['PORT', demoShipThruster],
                ['STBD', demoShipThruster],
            ];
            const state = makeShipState('1', { ...demoShipConfig, chainGuns, thrusters });
            state.spaceship.angle = 0;
            const profile = makeFlightProfile(state, FlightDoctrine.STANDOFF);

            const bearings = [44, 46, 44, 46, 44, 46, 44, 46];
            const offsets = bearings.map((bearing) => {
                const radians = (bearing * Math.PI) / 180;
                const target = makeTarget({ x: 10_000 * Math.cos(radians), y: 10_000 * Math.sin(radians) });
                return profile.headingOffset(target);
            });

            const distinctValues = new Set(offsets);
            expect(distinctValues.size).to.be.at.most(2);
            // Once settled, later ticks must not keep flipping back and forth.
            expect(offsets.slice(-4).every((o) => o === offsets[offsets.length - 1])).to.equal(true);
        });
    });
});
