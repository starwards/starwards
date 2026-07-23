import {
    Armor,
    Asteroid,
    Explosion,
    Faction,
    Projectile,
    REAR_ARC,
    RTuple2,
    ScanLevel,
    ShipDie,
    ShipManagerNpc,
    ShipManagerPc,
    SpaceManager,
    SpaceObject,
    Spaceship,
    Vec2,
    XY,
    calcShellSecondsToLive,
    concatinateArchs,
} from '../src';

import { Circle } from 'detect-collisions';
import { SpaceSimulator } from './simulator';
import { expect } from 'chai';
import fc from 'fast-check';
import { float } from './properties';
import { switchToAvailableAmmo } from '../src/ship/chain-gun-manager';

function calcCollider(timeInSeconds: number, target: SpaceObject, speed: number) {
    const hitAngle = 0;
    const velocity = XY.byLengthAndDirection(speed, hitAngle);
    const position = XY.sum(
        target.position,
        XY.byLengthAndDirection(timeInSeconds * speed + target.radius, 180 - hitAngle),
    );
    return { velocity, position };
}

function* getHitPlatesArch(armor: Armor, range: RTuple2) {
    const degreesPerPlate = armor.degreesPerPlate;
    for (const [i, plate] of armor.platesInRange(range)) {
        if (plate.healthRatio < 1) {
            const start = i * degreesPerPlate;
            yield [start, start + degreesPerPlate] as const;
        }
    }
}

const bulletSpeed = 1000;
describe('SpaceManager', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('upon collision, shell explodes on surface of object (not inside)', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const target = new Asteroid();
                    target.radius = Spaceship.radius;
                    const explosion = new Explosion();
                    const explosionInit = jest.spyOn(explosion, 'init');
                    // proximity-fuzed and untargeted: flies straight like a dumb shell,
                    // detonates only on actual contact (no in-flight proximity trigger)
                    const shell = new Projectile('FragMissile');
                    shell._explosion = explosion;
                    const { velocity, position } = calcCollider(timeInSeconds, target, bulletSpeed);
                    shell.velocity = Vec2.make(velocity);
                    shell.secondsToLive = timeInSeconds * 3; // enough time to collide
                    shell.init('shell', Vec2.make(position));
                    const { iterationTimeInSeconds } = new SpaceSimulator(numIterationsPerSecond)
                        .withObjects(target, shell)
                        .simulateUntilCondition(() => explosionInit.mock.calls.length > 0, timeInSeconds);

                    const explosionCenter = explosionInit.mock.calls[0][1];
                    const distance = XY.lengthOf(XY.difference(explosionCenter, target.position));
                    expect(distance).to.be.closeTo(target.radius, bulletSpeed * iterationTimeInSeconds * 2);
                    expect(distance).to.be.gte(target.radius);
                },
            ),
        );
    });
    it('upon collision, target takes damage', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const target = new Asteroid();
                    const initialHealth = target.health;
                    target.radius = Spaceship.radius;
                    const collider = new Asteroid();
                    collider.radius = Spaceship.radius;
                    const { velocity, position } = calcCollider(timeInSeconds, target, bulletSpeed);
                    collider.velocity = Vec2.make(velocity);
                    collider.init('collider', Vec2.make(position));

                    new SpaceSimulator(numIterationsPerSecond)
                        .withObjects(target, collider)
                        .simulateUntilCondition(() => target.health !== initialHealth, timeInSeconds);
                },
            ),
        );
    });
    it('upon collision, ship takes damage', () => {
        fc.assert(
            fc.property(
                float(1, 5),
                fc.integer({ min: 15, max: 20 }),
                (timeInSeconds: number, numIterationsPerSecond: number) => {
                    const target = new Spaceship();
                    const collider = new Asteroid();
                    collider.radius = Spaceship.radius;
                    const { velocity, position } = calcCollider(timeInSeconds, target, bulletSpeed);
                    collider.velocity = Vec2.make(velocity);
                    collider.init('collider', Vec2.make(position));

                    new SpaceSimulator(numIterationsPerSecond)
                        .withObjects(target, collider)
                        .simulateUntilCondition(
                            (spaceMgr) => [...spaceMgr.resolveObjectDamage(target.id)].length > 0,
                            timeInSeconds,
                        );
                },
            ),
        );
    });

    describe.each([ShipManagerPc, ShipManagerNpc])(
        `%p in high speed (up to ${bulletSpeed} m/s )`,
        (shipManagerCtor) => {
            function highSpeedShip(numIterationsPerSecond: number, speed: number) {
                const sim = new SpaceSimulator(numIterationsPerSecond);
                const ship = new Spaceship();
                ship.id = 'ship';
                const shipMgr = sim.withShip(ship, new ShipDie(0), shipManagerCtor);
                ship.velocity = Vec2.make(XY.byLengthAndDirection(speed, ship.angle));
                shipMgr.state.spaceship.velocity = ship.velocity;
                shipMgr.state.chainGun!.design.maxShellRange = 10_000;
                shipMgr.state.chainGun!.shellRange = 1;
                shipMgr.state.chainGun!.loading = 1;
                shipMgr.state.chainGun!.loadedProjectile = 'HiExpShell';
                shipMgr.state.chainGun!.isFiring = true;
                switchToAvailableAmmo(shipMgr.state.chainGun!, shipMgr.state.magazine);

                // stop simulation when first bullet reaches its range
                const shellSecondsToLive = calcShellSecondsToLive(
                    shipMgr.state,
                    shipMgr.state.chainGun!,
                    shipMgr.state.chainGun!.design.maxShellRange,
                );
                return { sim, shellSecondsToLive, ship, shipMgr };
            }

            it.skip('does not shoot itself in the back when accelerating (regression)', () => {
                // KNOWN BUG: Ships CAN shoot themselves at high speeds
                //
                // Root Cause:
                // - Projectiles don't track which ship fired them (no sourceShipId field)
                // - Collision detection in SpaceManager doesn't prevent self-damage
                // - At high speeds (ship speed = projectile speed), ships catch their own projectiles
                //
                // To Fix:
                // 1. Add @gameField('string') sourceShipId to Projectile class
                // 2. Set sourceShipId when projectile is spawned
                // 3. In SpaceManager.handleCollisions(), skip collision if:
                //    - One object is a Projectile
                //    - Other object is a Spaceship
                //    - projectile.sourceShipId === ship.id
                //
                // Test uses 100% bullet speed to verify the bug is fixed
                const speed = bulletSpeed;
                const numIterationsPerSecond = 20;
                const { sim, shellSecondsToLive, shipMgr } = highSpeedShip(numIterationsPerSecond, speed);
                shipMgr.state.smartPilot.maneuvering.x = 1; // fly forward
                shipMgr.state.afterBurnerCommand = 1; // afterburner

                sim.simulateUntilTime(shellSecondsToLive * 10, (_spaceMgr) => {
                    shipMgr.state.maneuvering.afterBurnerFuel = shipMgr.state.maneuvering.design.maxAfterBurnerFuel;
                });
                const hitArchs = [...concatinateArchs(getHitPlatesArch(shipMgr.state.armor, REAR_ARC))];
                expect(hitArchs).to.eql([]);
            });
        },
    );

    describe('Scan Level Management', () => {
        it('should set and get scan level for faction', () => {
            const sim = new SpaceSimulator(10);
            const target = new Spaceship();
            target.id = 'target-ship';
            sim.withObjects(target);
            sim.spaceMgr.forceFlushEntities();

            sim.spaceMgr.setScanLevel(target.id, Faction.Gravitas, ScanLevel.BASIC);
            expect(sim.spaceMgr.getScanLevel(target.id, Faction.Gravitas)).to.equal(ScanLevel.BASIC);
        });

        it('should keep scan levels independent per faction', () => {
            const sim = new SpaceSimulator(10);
            const target = new Spaceship();
            target.id = 'target-ship';
            sim.withObjects(target);
            sim.spaceMgr.forceFlushEntities();

            sim.spaceMgr.setScanLevel(target.id, Faction.Gravitas, ScanLevel.ADVANCED);
            sim.spaceMgr.setScanLevel(target.id, Faction.Raiders, ScanLevel.UFO);

            expect(sim.spaceMgr.getScanLevel(target.id, Faction.Gravitas)).to.equal(ScanLevel.ADVANCED);
            expect(sim.spaceMgr.getScanLevel(target.id, Faction.Raiders)).to.equal(ScanLevel.UFO);
        });

        it('should return UFO level for unset faction', () => {
            const sim = new SpaceSimulator(10);
            const target = new Spaceship();
            target.id = 'target-ship';
            sim.withObjects(target);
            sim.spaceMgr.forceFlushEntities();

            expect(sim.spaceMgr.getScanLevel(target.id, Faction.Gravitas)).to.equal(ScanLevel.UFO);
        });

        it('should persist scan levels (no decay)', () => {
            const sim = new SpaceSimulator(10);
            const target = new Spaceship();
            target.id = 'target-ship';
            sim.withObjects(target);
            sim.spaceMgr.forceFlushEntities();

            sim.spaceMgr.setScanLevel(target.id, Faction.Gravitas, ScanLevel.ADVANCED);

            // Simulate time passing (10 minutes)
            sim.simulateUntilTime(600);

            expect(sim.spaceMgr.getScanLevel(target.id, Faction.Gravitas)).to.equal(ScanLevel.ADVANCED);
        });

        it('should allow scan if target in radar range', () => {
            const sim = new SpaceSimulator(10);
            const scanner = new Spaceship();
            scanner.id = 'scanner';
            scanner.radarRange = 5000;
            scanner.position = Vec2.make({ x: 0, y: 0 });

            const target = new Spaceship();
            target.id = 'target';
            target.position = Vec2.make({ x: 3000, y: 0 });

            sim.withObjects(scanner, target);
            sim.spaceMgr.forceFlushEntities();

            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            expect(sim.spaceMgr.canScan(scanner.id, target.id)).to.be.true;
        });

        it('should block scan if target out of range', () => {
            const sim = new SpaceSimulator(10);
            const scanner = new Spaceship();
            scanner.id = 'scanner';
            scanner.radarRange = 5000;
            scanner.position = Vec2.make({ x: 0, y: 0 });

            const target = new Spaceship();
            target.id = 'target';
            target.position = Vec2.make({ x: 8000, y: 0 });

            sim.withObjects(scanner, target);
            sim.spaceMgr.forceFlushEntities();

            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            expect(sim.spaceMgr.canScan(scanner.id, target.id)).to.be.false;
        });

        it('should return at least BASIC for same-faction targets', () => {
            const sim = new SpaceSimulator(10);
            const target = new Spaceship();
            target.id = 'target-ship';
            target.faction = Faction.Gravitas;
            sim.withObjects(target);
            sim.spaceMgr.forceFlushEntities();

            // Same faction should get at least BASIC, even without scanning
            expect(sim.spaceMgr.getScanLevel(target.id, Faction.Gravitas)).to.equal(ScanLevel.BASIC);

            // Different faction should get UFO
            expect(sim.spaceMgr.getScanLevel(target.id, Faction.Raiders)).to.equal(ScanLevel.UFO);
        });
    });

    describe('multi-ship move order preserves formation', () => {
        it('assigns per-ship destination offsets from group center', () => {
            const spaceMgr = new SpaceManager();
            const shipA = new Spaceship();
            shipA.id = 'ship-a';
            shipA.position = Vec2.make({ x: 100, y: 100 });
            const shipB = new Spaceship();
            shipB.id = 'ship-b';
            shipB.position = Vec2.make({ x: 200, y: 100 });
            const shipC = new Spaceship();
            shipC.id = 'ship-c';
            shipC.position = Vec2.make({ x: 100, y: 200 });

            spaceMgr.insertBulk([shipA, shipB, shipC]);
            spaceMgr.forceFlushEntities();

            // Issue a bulk move order to all 3 ships
            const targetPosition = { x: 500, y: 500 };
            spaceMgr.state.botOrderCommands.push({
                ids: ['ship-a', 'ship-b', 'ship-c'],
                order: { type: 'move', position: targetPosition },
            });

            // Run one update tick to process the command
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            // Group center is (133.33, 133.33)
            // Ship A offset: (-33.33, -33.33) → destination ≈ (466.67, 466.67)
            // Ship B offset: (66.67, -33.33) → destination ≈ (566.67, 466.67)
            // Ship C offset: (-33.33, 66.67) → destination ≈ (466.67, 566.67)
            const orderA = spaceMgr.resolveObjectOrder('ship-a');
            const orderB = spaceMgr.resolveObjectOrder('ship-b');
            const orderC = spaceMgr.resolveObjectOrder('ship-c');

            expect(orderA).to.not.equal(null);
            expect(orderB).to.not.equal(null);
            expect(orderC).to.not.equal(null);
            expect(orderA!.type).to.equal('move');
            expect(orderB!.type).to.equal('move');
            expect(orderC!.type).to.equal('move');

            if (orderA!.type === 'move' && orderB!.type === 'move' && orderC!.type === 'move') {
                // Each ship should have a different destination
                expect(orderA!.position.x).to.not.equal(orderB!.position.x);
                expect(orderA!.position.y).to.not.equal(orderC!.position.y);

                // Relative offsets should be preserved
                const abDiffX = orderB!.position.x - orderA!.position.x;
                const acDiffY = orderC!.position.y - orderA!.position.y;
                expect(abDiffX).to.be.closeTo(100, 1); // Ship B was 100 units right of Ship A
                expect(acDiffY).to.be.closeTo(100, 1); // Ship C was 100 units below Ship A
            }
        });

        it('single-ship move order uses exact target position', () => {
            const spaceMgr = new SpaceManager();
            const ship = new Spaceship();
            ship.id = 'solo-ship';
            ship.position = Vec2.make({ x: 100, y: 100 });

            spaceMgr.insert(ship);
            spaceMgr.forceFlushEntities();

            const targetPosition = { x: 500, y: 500 };
            spaceMgr.state.botOrderCommands.push({
                ids: ['solo-ship'],
                order: { type: 'move', position: targetPosition },
            });

            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const order = spaceMgr.resolveObjectOrder('solo-ship');
            expect(order).to.not.equal(null);
            expect(order!.type).to.equal('move');
            if (order!.type === 'move') {
                expect(order!.position.x).to.equal(500);
                expect(order!.position.y).to.equal(500);
            }
        });

        it('non-move orders are unaffected by formation logic', () => {
            const spaceMgr = new SpaceManager();
            const shipA = new Spaceship();
            shipA.id = 'atk-a';
            shipA.position = Vec2.make({ x: 100, y: 100 });
            const shipB = new Spaceship();
            shipB.id = 'atk-b';
            shipB.position = Vec2.make({ x: 200, y: 200 });

            spaceMgr.insertBulk([shipA, shipB]);
            spaceMgr.forceFlushEntities();

            spaceMgr.state.botOrderCommands.push({
                ids: ['atk-a', 'atk-b'],
                order: { type: 'attack', targetId: 'enemy-1' },
            });

            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const orderA = spaceMgr.resolveObjectOrder('atk-a');
            const orderB = spaceMgr.resolveObjectOrder('atk-b');
            expect(orderA).to.not.equal(null);
            expect(orderB).to.not.equal(null);
            expect(orderA!.type).to.equal('attack');
            expect(orderB!.type).to.equal('attack');
            if (orderA!.type === 'attack' && orderB!.type === 'attack') {
                expect(orderA!.targetId).to.equal('enemy-1');
                expect(orderB!.targetId).to.equal('enemy-1');
            }
        });

        it('multi-ship command with some invalid IDs still dispatches to valid ships', () => {
            const spaceMgr = new SpaceManager();
            const shipA = new Spaceship();
            shipA.id = 'valid-a';
            shipA.position = Vec2.make({ x: 100, y: 100 });
            const shipB = new Spaceship();
            shipB.id = 'valid-b';
            shipB.position = Vec2.make({ x: 200, y: 100 });

            spaceMgr.insertBulk([shipA, shipB]);
            spaceMgr.forceFlushEntities();

            // Include a non-existent ship ID alongside valid ones
            spaceMgr.state.botOrderCommands.push({
                ids: ['valid-a', 'destroyed-ship', 'valid-b'],
                order: { type: 'move', position: { x: 500, y: 500 } },
            });

            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const orderA = spaceMgr.resolveObjectOrder('valid-a');
            const orderB = spaceMgr.resolveObjectOrder('valid-b');
            const orderGhost = spaceMgr.resolveObjectOrder('destroyed-ship');

            expect(orderA).to.not.equal(null);
            expect(orderB).to.not.equal(null);
            expect(orderGhost).to.equal(null);

            if (orderA!.type === 'move' && orderB!.type === 'move') {
                // Relative offset between A and B should be preserved (100 units apart on x)
                expect(orderB!.position.x - orderA!.position.x).to.be.closeTo(100, 1);
                expect(orderB!.position.y - orderA!.position.y).to.be.closeTo(0, 1);
            }
        });

        it('multi-ship command with only one valid ship uses exact target position', () => {
            const spaceMgr = new SpaceManager();
            const ship = new Spaceship();
            ship.id = 'sole-survivor';
            ship.position = Vec2.make({ x: 100, y: 100 });

            spaceMgr.insert(ship);
            spaceMgr.forceFlushEntities();

            spaceMgr.state.botOrderCommands.push({
                ids: ['sole-survivor', 'ghost-1', 'ghost-2'],
                order: { type: 'move', position: { x: 500, y: 500 } },
            });

            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });

            const order = spaceMgr.resolveObjectOrder('sole-survivor');
            expect(order).to.not.equal(null);
            expect(order!.type).to.equal('move');
            if (order!.type === 'move') {
                expect(order!.position.x).to.equal(500);
                expect(order!.position.y).to.equal(500);
            }
        });
    });

    it('insert adds object to state', () => {
        const spaceMgr = new SpaceManager();
        const ship = new Spaceship();
        ship.id = 'test-ship';
        spaceMgr.insert(ship);
        spaceMgr.forceFlushEntities();
        const found = [...spaceMgr.state.getAll('Spaceship')].find((s) => s.id === 'test-ship');
        expect(found).to.not.equal(undefined);
    });

    it('destroyObject removes object from state', () => {
        const spaceMgr = new SpaceManager();
        const ship = new Spaceship();
        ship.id = 'test-ship-2';
        spaceMgr.insert(ship);
        spaceMgr.forceFlushEntities();
        spaceMgr.destroyObject(ship.id);
        const found = [...spaceMgr.state.getAll('Spaceship')].find((s) => s.id === 'test-ship-2');
        expect(found).to.equal(undefined);
    });

    it('setPosition updates object coordinates', () => {
        const spaceMgr = new SpaceManager();
        const ship = new Spaceship();
        ship.id = 'pos-test';
        ship.position.x = 0;
        ship.position.y = 0;
        spaceMgr.insert(ship);
        spaceMgr.forceFlushEntities();

        // Change position
        ship.position.x = 100;
        ship.position.y = 200;

        // Verify state reflects the change
        const found = [...spaceMgr.state.getAll('Spaceship')].find((s) => s.id === 'pos-test');
        expect(found!.position.x).to.equal(100);
        expect(found!.position.y).to.equal(200);
    });

    describe('collision body isStatic optimization', () => {
        function getCollisionBody(spaceMgr: SpaceManager, object: SpaceObject) {
            const bodies = spaceMgr.collisions.all() as Circle[];
            return bodies.find(
                (body) => body.x === object.position.x && body.y === object.position.y && body.r === object.radius,
            );
        }

        it('marks a frozen object collision body as static, and unmarks it when unfrozen', () => {
            const spaceMgr = new SpaceManager();
            const asteroid = new Asteroid();
            asteroid.id = 'static-test-asteroid';
            asteroid.position = Vec2.make({ x: 1234, y: 4321 });
            spaceMgr.insert(asteroid);
            spaceMgr.forceFlushEntities();

            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });
            expect(getCollisionBody(spaceMgr, asteroid)?.isStatic).to.equal(false);

            asteroid.freeze = true;
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });
            expect(getCollisionBody(spaceMgr, asteroid)?.isStatic).to.equal(true);

            asteroid.freeze = false;
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });
            expect(getCollisionBody(spaceMgr, asteroid)?.isStatic).to.equal(false);
        });

        it('removes a destroyed object collision body outright (no need to mark it static)', () => {
            const spaceMgr = new SpaceManager();
            const asteroid = new Asteroid();
            asteroid.id = 'static-test-destroyed';
            asteroid.position = Vec2.make({ x: 5678, y: 8765 });
            spaceMgr.insert(asteroid);
            spaceMgr.forceFlushEntities();

            spaceMgr.destroyObject(asteroid.id);
            spaceMgr.update({ deltaSeconds: 0.1, deltaSecondsAvg: 0.1, totalSeconds: 0.1 });
            expect(getCollisionBody(spaceMgr, asteroid)).to.equal(undefined);
        });
    });

    it('insertBulk adds multiple objects', () => {
        const spaceMgr = new SpaceManager();
        const ship1 = new Spaceship();
        ship1.id = 'bulk-1';
        const ship2 = new Spaceship();
        ship2.id = 'bulk-2';
        const asteroid = new Asteroid();
        asteroid.id = 'bulk-a1';

        spaceMgr.insertBulk([ship1, ship2, asteroid]);
        spaceMgr.forceFlushEntities();

        const ships = [...spaceMgr.state.getAll('Spaceship')];
        const asteroids = [...spaceMgr.state.getAll('Asteroid')];
        expect(ships).to.have.length.greaterThanOrEqual(2);
        expect(asteroids).to.have.length.greaterThanOrEqual(1);
    });

    describe('absolute speed cap', () => {
        it('changeVelocity clamps the resultant speed to absoluteMaxSpeed, preserving direction', () => {
            const spaceMgr = new SpaceManager();
            const ship = new Spaceship();
            ship.id = 'cap-change-velocity';
            spaceMgr.insert(ship);
            spaceMgr.forceFlushEntities();

            const cap = spaceMgr.state.absoluteMaxSpeed;
            const direction = 37;
            spaceMgr.changeVelocity(ship.id, XY.byLengthAndDirection(cap * 10, direction));

            expect(XY.lengthOf(ship.velocity)).to.be.closeTo(cap, 0.01);
            expect(XY.angleOf(ship.velocity)).to.be.closeTo(direction, 0.01);
        });

        it('setVelocity clamps the resultant speed to absoluteMaxSpeed, preserving direction', () => {
            const spaceMgr = new SpaceManager();
            const ship = new Spaceship();
            ship.id = 'cap-set-velocity';
            spaceMgr.insert(ship);
            spaceMgr.forceFlushEntities();

            const cap = spaceMgr.state.absoluteMaxSpeed;
            const direction = 123;
            spaceMgr.setVelocity(ship.id, XY.byLengthAndDirection(cap * 10, direction));

            expect(XY.lengthOf(ship.velocity)).to.be.closeTo(cap, 0.01);
            expect(XY.angleOf(ship.velocity)).to.be.closeTo(direction, 0.01);
        });

        it('a velocity below the cap is left untouched', () => {
            const spaceMgr = new SpaceManager();
            const ship = new Spaceship();
            ship.id = 'below-cap';
            spaceMgr.insert(ship);
            spaceMgr.forceFlushEntities();

            const belowCap = spaceMgr.state.absoluteMaxSpeed / 2;
            spaceMgr.setVelocity(ship.id, XY.byLengthAndDirection(belowCap, 10));

            expect(XY.lengthOf(ship.velocity)).to.be.closeTo(belowCap, 0.01);
        });

        it('a collision impulse beyond absoluteMaxSpeed is clamped, direction preserved', () => {
            const numIterationsPerSecond = 20;
            const timeInSeconds = 2;
            const target = new Asteroid();
            target.radius = Spaceship.radius;
            const collider = new Asteroid();
            collider.radius = Spaceship.radius;
            const extremeSpeed = 1_000_000;
            const { velocity, position } = calcCollider(timeInSeconds, target, extremeSpeed);
            collider.velocity = Vec2.make(velocity);
            collider.init('collider', Vec2.make(position));

            const sim = new SpaceSimulator(numIterationsPerSecond).withObjects(target, collider);
            sim.simulateUntilCondition(() => !XY.isZero(target.velocity, 0.01), timeInSeconds);

            const cap = sim.spaceMgr.state.absoluteMaxSpeed;
            expect(XY.lengthOf(target.velocity)).to.be.at.most(cap + 0.01);
            expect(XY.lengthOf(collider.velocity)).to.be.at.most(cap + 0.01);
        });

        it("does not change the ship flight-computer's own (much lower) soft-brake speed limit", () => {
            const sim = new SpaceSimulator(20);
            const ship = new Spaceship();
            ship.id = 'soft-brake-ship';
            // start above the ship's own maxSpeed but well below the room's absoluteMaxSpeed
            ship.velocity = Vec2.make(XY.byLengthAndDirection(400, 0));
            const shipMgr = sim.withShip(ship, new ShipDie(0), ShipManagerNpc);
            shipMgr.state.spaceship.velocity = ship.velocity;

            expect(shipMgr.state.maxSpeed).to.be.lessThan(sim.spaceMgr.state.absoluteMaxSpeed);

            sim.simulateUntilTime(5);

            // the ship's own soft-brake reins it back toward its own (much lower) maxSpeed,
            // unaffected by the new room-level absoluteMaxSpeed cap
            expect(XY.lengthOf(ship.velocity)).to.be.lessThan(400);
            expect(XY.lengthOf(ship.velocity)).to.be.at.most(sim.spaceMgr.state.absoluteMaxSpeed);
        });
    });
});
