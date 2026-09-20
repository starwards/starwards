import { BLAST_LIFETIME_FACTOR, Explosion, Projectile, SpaceManager, Vec2, ammoDesigns } from '../src';

/**
 * Issue #2252: a blast used to inherit its shell's full velocity and fly the target's own
 * timescale (secondsToLive/expansionSpeed as tabled), which let a still-growing cloud outrun
 * a moving target before it could ever overlap it. This pins the two-part fix: the inherited
 * velocity is damped by a named, @tweakable factor, and every warhead's blast lifetime is
 * shortened by BLAST_LIFETIME_FACTOR with expansionSpeed raised by the same factor, so reach
 * (secondsToLive * expansionSpeed) is unchanged (see explosion-product-invariant.spec.ts).
 */
describe('blast velocity inheritance is damped at spawn (issue #2252)', () => {
    it('a freshly detonated explosion inherits a damped fraction of its shell velocity, not the whole of it', () => {
        const spaceMgr = new SpaceManager();
        const shell = new Projectile('HiExpShell');
        const shellVelocity = Vec2.make({ x: 1234, y: -321 });
        shell.velocity = shellVelocity;
        shell.secondsToLive = 0.005;
        shell.init('shell', Vec2.make({ x: 0, y: 0 }));
        spaceMgr.insert(shell);
        spaceMgr.forceFlushEntities();

        // proximity-fuzed rounds detonate as a backup time-fuze on lifetime expiry
        // (destroyTimedOut in space-manager.ts) -- no target is needed to force detonation.
        spaceMgr.update({ deltaSeconds: 0.01, deltaSecondsAvg: 0.01, totalSeconds: 0.01 });
        // the new Explosion lands in `toInsert`; the next tick's own handleToInsert flushes it
        spaceMgr.update({ deltaSeconds: 0.01, deltaSecondsAvg: 0.01, totalSeconds: 0.02 });

        const explosion = [...spaceMgr.state.getAll('Explosion')][0] as Explosion | undefined;
        expect(explosion).toBeDefined();
        const inheritance = explosion!.velocityInheritance;
        expect(inheritance).toBeGreaterThan(0);
        expect(inheritance).toBeLessThan(1);
        expect(explosion!.velocity.x).toBeCloseTo(shellVelocity.x * inheritance, 3);
        expect(explosion!.velocity.y).toBeCloseTo(shellVelocity.y * inheritance, 3);
    });
});

describe('blast lifetime is shortened at constant reach (issue #2252)', () => {
    it('BLAST_LIFETIME_FACTOR is greater than 1 (blasts are shortened, not lengthened)', () => {
        expect(BLAST_LIFETIME_FACTOR).toBeGreaterThan(1);
    });

    it('HiExpShell: secondsToLive and expansionSpeed move by BLAST_LIFETIME_FACTOR from their pre-#2252 values (1s, 200m/s)', () => {
        expect(ammoDesigns.HiExpShell.explosion.secondsToLive).toBeCloseTo(1 / BLAST_LIFETIME_FACTOR, 5);
        expect(ammoDesigns.HiExpShell.explosion.expansionSpeed).toBeCloseTo(200 * BLAST_LIFETIME_FACTOR, 5);
    });

    it('FragMissile: secondsToLive and expansionSpeed move by BLAST_LIFETIME_FACTOR from their pre-#2252 values (1.6s, 500m/s)', () => {
        expect(ammoDesigns.FragMissile.explosion.secondsToLive).toBeCloseTo(1.6 / BLAST_LIFETIME_FACTOR, 5);
        expect(ammoDesigns.FragMissile.explosion.expansionSpeed).toBeCloseTo(500 * BLAST_LIFETIME_FACTOR, 5);
    });
});
