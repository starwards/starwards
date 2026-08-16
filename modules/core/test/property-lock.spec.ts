import { PowerLevel, Radar } from '../src';
import { commandable, gameField } from '../src/game-field';
import { handleGmSetValueCommand, handleJsonPointerCommand } from '../src/commands';
import { isFieldLocked, setFieldLocked, withLockBypass } from '../src/lock-registry';

import { JsonPointer } from '../src/json-ptr';
import { Schema } from '@colyseus/schema';
import { expect } from 'chai';

// A locked field must reject writes regardless of *how* the write is attempted:
// through the JSON Pointer command surface (GM tweak panel, Node-RED, MCP) or
// through a plain JS assignment from server-side game logic (e.g. a manager's
// per-tick update loop, which never goes through JsonPointer.set). Both paths
// ultimately invoke the same Colyseus-generated property setter, so guarding
// that setter is the single choke point that covers both.
describe('property lock', () => {
    class Lockable extends Schema {
        @commandable()
        @gameField('float32')
        value = 0;

        @commandable()
        @gameField('float32')
        other = 0;
    }

    it('is unlocked by default', () => {
        const t = new Lockable();
        expect(isFieldLocked(t, 'value')).to.equal(false);
    });

    it('silently ignores a JSON Pointer write to a locked field', () => {
        const t = new Lockable();
        t.value = 5;
        setFieldLocked(t, 'value', true);
        JsonPointer.create('/value').set(t, 99);
        expect(t.value).to.equal(5);
    });

    it('silently ignores a direct assignment to a locked field', () => {
        const t = new Lockable();
        t.value = 5;
        setFieldLocked(t, 'value', true);
        t.value = 99;
        expect(t.value).to.equal(5);
    });

    it('does not lock other fields on the same instance', () => {
        const t = new Lockable();
        setFieldLocked(t, 'value', true);
        t.other = 42;
        expect(t.other).to.equal(42);
    });

    it('restores normal write behavior once unlocked', () => {
        const t = new Lockable();
        setFieldLocked(t, 'value', true);
        setFieldLocked(t, 'value', false);
        t.value = 7;
        expect(t.value).to.equal(7);
        expect(isFieldLocked(t, 'value')).to.equal(false);
    });

    it('locks are independent per instance', () => {
        const a = new Lockable();
        const b = new Lockable();
        setFieldLocked(a, 'value', true);
        b.value = 3;
        expect(b.value).to.equal(3);
    });

    // Mirrors Turret.bearingCommand: a plain accessor pair (not itself @gameField) that
    // clamps and forwards to a differently-named backing @gameField. The lock is addressed
    // by the accessor's own name, so the guard must live on the accessor's setter too — a
    // lock on the backing field's name alone would not stop writes made through the accessor.
    class ClampedAccessor extends Schema {
        @gameField('float32')
        rawValue = 0;

        @commandable()
        get clamped(): number {
            return this.rawValue;
        }
        set clamped(value: number) {
            this.rawValue = Math.min(10, value);
        }
    }

    it('silently ignores writes through a locked plain accessor backed by a differently-named @gameField', () => {
        const t = new ClampedAccessor();
        t.clamped = 5;
        setFieldLocked(t, 'clamped', true);
        t.clamped = 9;
        expect(t.clamped).to.equal(5);
    });

    it('restores writes through the accessor once unlocked', () => {
        const t = new ClampedAccessor();
        t.clamped = 5;
        setFieldLocked(t, 'clamped', true);
        setFieldLocked(t, 'clamped', false);
        t.clamped = 9;
        expect(t.clamped).to.equal(9);
    });

    // Turret.bearingCommand is the real production instance of the ClampedAccessor pattern
    // above: a @commandable get/set pair whose actual storage (bearingCommandRaw) has a
    // different name.
    it('locking Turret.bearingCommand actually blocks writes through it', () => {
        const radar = new Radar();
        radar.power = PowerLevel.MAX;
        radar.bearingCommand = 10;
        setFieldLocked(radar, 'bearingCommand', true);
        radar.bearingCommand = 45;
        expect(radar.bearingCommand).to.be.closeTo(10, 0.001);
    });
});

// The GM tweak panel outranks the lock: the lock exists to silence every OTHER writer (sim
// tick, bots, crew stations, MCP, node-red), not the GM's own hand-adjustment. See
// governance/invariants.md I10 in starwards-design.
describe('withLockBypass / GM lock override', () => {
    class Lockable extends Schema {
        @commandable()
        @gameField('float32')
        value = 0;
    }

    it('lets a write through a locked field while the bypass is active', () => {
        const t = new Lockable();
        setFieldLocked(t, 'value', true);
        withLockBypass(() => {
            t.value = 42;
        });
        expect(t.value).to.equal(42);
    });

    it('re-locks the field once the bypass scope exits', () => {
        const t = new Lockable();
        setFieldLocked(t, 'value', true);
        withLockBypass(() => {
            t.value = 42;
        });
        t.value = 99;
        expect(t.value).to.equal(42);
    });

    it('restores the lock even when the bypassed callback throws', () => {
        const t = new Lockable();
        setFieldLocked(t, 'value', true);
        expect(() =>
            withLockBypass(() => {
                throw new Error('boom');
            }),
        ).to.throw('boom');
        t.value = 99;
        expect(t.value).to.equal(0);
    });

    it('does not let an inner bypass exiting re-lock an outer bypass still in flight', () => {
        const t = new Lockable();
        setFieldLocked(t, 'value', true);
        withLockBypass(() => {
            withLockBypass(() => {
                t.value = 1;
            });
            // inner bypass has exited; outer is still active
            t.value = 2;
            expect(t.value).to.equal(2);
        });
    });

    it('handleGmSetValueCommand writes through a locked field', () => {
        const t = new Lockable();
        t.value = 5;
        setFieldLocked(t, 'value', true);
        const handled = handleGmSetValueCommand({ path: '/value', value: 99 }, t);
        expect(handled).to.equal(true);
        expect(t.value).to.equal(99);
    });

    it('a plain JSON-pointer write to the same locked field is still ignored', () => {
        const t = new Lockable();
        t.value = 5;
        setFieldLocked(t, 'value', true);
        handleJsonPointerCommand({ value: 99 }, '/value', t);
        expect(t.value).to.equal(5);
    });

    it('a GM write to a non-@commandable path is still refused', () => {
        class NotCommandable extends Schema {
            @gameField('float32')
            secret = 0;
        }
        const t = new NotCommandable();
        const handled = handleGmSetValueCommand({ path: '/secret', value: 99 }, t);
        expect(handled).to.equal(false);
        expect(t.secret).to.equal(0);
    });
});
