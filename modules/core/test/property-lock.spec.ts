import { commandable, gameField } from '../src/game-field';
import { isFieldLocked, setFieldLocked } from '../src/lock-registry';

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
});
