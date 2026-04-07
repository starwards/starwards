import { JsonPointer, getJsonPointer, isJsonPointer } from '../src/json-ptr';
import { commandable, gameField } from '../src/game-field';

import { Schema } from '@colyseus/schema';
import { expect } from 'chai';

// These tests lock in the @commandable whitelist behavior introduced in PR2.
// They are intentionally framework-light: pure Schema instances, no Colyseus
// rooms, no game state. This makes the failure mode (someone removed the
// whitelist or moved Reflect.set out from under the isCommandable guard)
// crystal clear in the diff.

describe('JsonPointer @commandable whitelist', () => {
    class WriteableThing extends Schema {
        @commandable
        @gameField('float32')
        allowed = 0;

        @gameField('float32')
        forbidden = 0;
    }

    class Subclass extends WriteableThing {
        @commandable
        @gameField('float32')
        subOnly = 0;
    }

    describe('strict mode', () => {
        const previousStrict = process.env.STARWARDS_STRICT_CMD;
        beforeAll(() => {
            process.env.STARWARDS_STRICT_CMD = '1';
        });
        afterAll(() => {
            if (previousStrict === undefined) {
                delete process.env.STARWARDS_STRICT_CMD;
            } else {
                process.env.STARWARDS_STRICT_CMD = previousStrict;
            }
        });

        it('allows writes to @commandable fields', () => {
            const t = new WriteableThing();
            JsonPointer.create('/allowed').set(t, 7);
            expect(t.allowed).to.equal(7);
        });

        it('throws on writes to bare @gameField properties', () => {
            const t = new WriteableThing();
            expect(() => JsonPointer.create('/forbidden').set(t, 7)).to.throw(/non-@commandable/);
            expect(t.forbidden).to.equal(0);
        });

        it('inherits @commandable allowlist from parent class', () => {
            const t = new Subclass();
            JsonPointer.create('/allowed').set(t, 3);
            JsonPointer.create('/subOnly').set(t, 4);
            expect(t.allowed).to.equal(3);
            expect(t.subOnly).to.equal(4);
        });

        it('still rejects parent forbidden field on a subclass', () => {
            const t = new Subclass();
            expect(() => JsonPointer.create('/forbidden').set(t, 9)).to.throw(/non-@commandable/);
        });

        it('subclass @commandable additions do NOT leak to parent class', () => {
            const parent = new WriteableThing();
            // `subOnly` only exists on Subclass; on a parent instance it isn't
            // even a property, so we just confirm the parent's forbidden set
            // didn't grow.
            expect(() => JsonPointer.create('/forbidden').set(parent, 1)).to.throw();
        });
    });

    describe('warn-only mode (STARWARDS_STRICT_CMD unset)', () => {
        const previousStrict = process.env.STARWARDS_STRICT_CMD;
        beforeAll(() => {
            delete process.env.STARWARDS_STRICT_CMD;
        });
        afterAll(() => {
            if (previousStrict !== undefined) {
                process.env.STARWARDS_STRICT_CMD = previousStrict;
            }
        });

        it('writes to non-@commandable still go through (warn only)', () => {
            const t = new WriteableThing();
            // Suppress the console.warn for this case so the test runner output stays clean.
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                JsonPointer.create('/forbidden').set(t, 11);
            } finally {
                warnSpy.mockRestore();
            }
            expect(t.forbidden).to.equal(11);
        });
    });
});

describe('JsonPointer pointer plumbing', () => {
    it('isJsonPointer accepts RFC 6901 valid strings', () => {
        expect(isJsonPointer('')).to.equal(true);
        expect(isJsonPointer('/')).to.equal(true);
        expect(isJsonPointer('/foo')).to.equal(true);
        expect(isJsonPointer('/foo/bar')).to.equal(true);
        expect(isJsonPointer('/foo/0/bar')).to.equal(true);
        expect(isJsonPointer('/escaped~1slash')).to.equal(true);
        expect(isJsonPointer('/escaped~0tilde')).to.equal(true);
    });

    it('isJsonPointer rejects non-strings and bad input', () => {
        expect(isJsonPointer(123)).to.equal(false);
        expect(isJsonPointer(null)).to.equal(false);
        expect(isJsonPointer(undefined)).to.equal(false);
        expect(isJsonPointer({})).to.equal(false);
    });

    it('decode handles ~0 and ~1 escapes', () => {
        expect(JsonPointer.decode('/foo~1bar')).to.deep.equal(['foo/bar']);
        expect(JsonPointer.decode('/foo~0bar')).to.deep.equal(['foo~bar']);
    });

    it('decode parses numeric segments as numbers', () => {
        expect(JsonPointer.decode('/0')).to.deep.equal([0]);
        expect(JsonPointer.decode('/foo/2/bar')).to.deep.equal(['foo', 2, 'bar']);
    });

    it('encode round-trips through decode', () => {
        const examples = ['/foo', '/foo/bar', '/foo/0', '/foo~1bar', '/foo~0bar', '/a/b/c'];
        for (const ptr of examples) {
            const decoded = JsonPointer.decode(ptr);
            expect(JsonPointer.encode(decoded)).to.equal(ptr);
        }
    });

    it('getJsonPointer caches identical strings', () => {
        const a = getJsonPointer('/cached/path');
        const b = getJsonPointer('/cached/path');
        expect(a).to.equal(b);
    });

    it('set throws on root pointer', () => {
        class T extends Schema {
            @commandable
            @gameField('float32')
            x = 0;
        }
        expect(() => JsonPointer.create('').set(new T(), 1)).to.throw(/root/);
    });
});
