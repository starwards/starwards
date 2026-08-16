import { Spaceship, XY, makeShipState, shipConfigurations, solveShellIntercept } from '../src';
import { float, xy } from './properties';

import { expect } from 'chai';
import fc from 'fast-check';

/**
 * `solveShellIntercept` has exactly one contract: fire along the returned aim point, dial the
 * returned fuze, and the shell detonates on the target. That is a closed-form identity, so it is
 * asserted directly here rather than inferred from whether an NPC happened to open fire —
 * `automation-order.spec.ts` covers the gunnery decisions built on top of it.
 *
 * The identity has to hold from the *muzzle*, `ship.radius` along the firing line. A solution
 * measured from the hull centre and converted afterwards by subtracting `radius / bulletSpeed`
 * satisfies it only while the ship and its target are mutually at rest: the conversion changes the
 * time of flight without re-evaluating the lead the target earns over it, leaving the shell
 * `|relativeVelocity| * radius / bulletSpeed` off the target.
 */
describe('solveShellIntercept', () => {
    const config = shipConfigurations['chaingun-platform'];

    function makeShip(radius: number, velocity: XY) {
        const state = makeShipState('shooter', config);
        state.spaceship.radius = radius;
        state.spaceship.velocity.setValue(velocity);
        return state;
    }

    function makeTarget(position: XY, velocity: XY) {
        const target = new Spaceship();
        target.id = 'target';
        target.position.setValue(position);
        target.velocity.setValue(velocity);
        return target;
    }

    /**
     * Where the shell actually is at fuze time: launched from the muzzle, carrying the hull's own
     * velocity, flying along the firing line the aim point defines. This is the same flight
     * `getShellExplosionLocation` integrates for a mount that has finished swinging onto its
     * `bearingCommand`.
     */
    function detonationPoint(shipPosition: XY, shipVelocity: XY, radius: number, aimPoint: XY, fuze: number) {
        const firingLine = XY.normalize(XY.difference(aimPoint, shipPosition));
        const muzzle = XY.add(shipPosition, XY.scale(firingLine, radius));
        const shellVelocity = XY.add(shipVelocity, XY.scale(firingLine, config.chainGuns[0][1].bulletSpeed));
        return XY.add(muzzle, XY.scale(shellVelocity, fuze));
    }

    it('detonates the shell on a moving target from a moving, large-radius hull', () => {
        const radius = config.radius;
        const shipVelocity = { x: 0, y: 300 };
        const state = makeShip(radius, shipVelocity);
        const target = makeTarget({ x: 5000, y: 0 }, { x: 0, y: -200 });

        const { aimPoint, secondsToLive } = solveShellIntercept(state, state.chainGuns[0], target);
        const detonation = detonationPoint(state.position, shipVelocity, radius, aimPoint, secondsToLive);
        const targetAtDetonation = XY.add(target.position, XY.scale(target.velocity, secondsToLive));

        expect(XY.lengthOf(XY.difference(detonation, targetAtDetonation))).to.be.lessThan(1);
    });

    it('detonates the shell on the target for any geometry inside the gun envelope', () => {
        fc.assert(
            fc.property(
                float(0, 800),
                xy(600),
                xy(config.chainGuns[0][1].maxShellRange, config.chainGuns[0][1].minShellRange),
                xy(600),
                (radius, shipVelocity, targetPosition, targetVelocity) => {
                    const state = makeShip(radius, shipVelocity);
                    const target = makeTarget(targetPosition, targetVelocity);

                    const { aimPoint, secondsToLive } = solveShellIntercept(state, state.chainGuns[0], target);
                    const detonation = detonationPoint(state.position, shipVelocity, radius, aimPoint, secondsToLive);
                    const targetAtDetonation = XY.add(target.position, XY.scale(target.velocity, secondsToLive));

                    // A metre, against a mount whose shells reach 12km — and against the ~100m
                    // error a hull-centre solution carries at these closing speeds.
                    expect(XY.lengthOf(XY.difference(detonation, targetAtDetonation))).to.be.lessThan(1);
                },
            ),
        );
    });
});
