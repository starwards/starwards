import {
    CommandablePaths,
    commandable,
    commandableSchema,
    gameField,
    isCommandableFromAncestor,
} from '../src/game-field';
import { DesignState, SystemState, defectible } from '../src/ship/system';
import { JsonPointer, getJsonPointer, isJsonPointer } from '../src/json-ptr';

import { Schema } from '@colyseus/schema';
import { expect } from 'chai';
import { range } from '../src/range';
import { tweakable } from '../src/tweakable';

// These tests lock in the @commandable whitelist behavior.
// They are intentionally framework-light: pure Schema instances, no Colyseus
// rooms, no game state. Strict mode is always active — there is no warn-only path.

describe('JsonPointer @commandable whitelist', () => {
    class WriteableThing extends Schema {
        @commandable()
        @gameField('float32')
        allowed = 0;

        @gameField('float32')
        forbidden = 0;
    }

    class Subclass extends WriteableThing {
        @commandable()
        @gameField('float32')
        subOnly = 0;
    }

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
        expect(() => JsonPointer.create('/forbidden').set(parent, 1)).to.throw();
    });
});

// These tests cover the "GM direct-control surface" arm of the whitelist.
// The GM tweak panel (`modules/browser/src/widgets/tweak.ts`) and
// design-state panel (`modules/browser/src/widgets/design-state.ts`) wire
// @tweakable fields and DesignState subclass fields directly to JSON
// Pointer writes. The whitelist admits those categories implicitly.
// See docs/json-ptr.md "GM direct-control surface" section.
describe('JsonPointer GM direct-control surface', () => {
    class GmSurface extends Schema {
        @tweakable('number')
        @gameField('float32')
        tweakOnly = 0;

        @gameField('float32')
        bareGameField = 0;
    }

    class GmSurfaceChild extends GmSurface {
        // Inherits `tweakOnly` from the parent class.
    }

    class MyDesignState extends DesignState {
        @gameField('float32')
        param = 0;

        @gameField('float32')
        other = 0;
    }

    // Regression guard: a sibling class that does NOT extend DesignState but
    // coincidentally has `isStarwardsDesignState = false` must NOT be treated
    // as a DesignState.
    class Imposter extends Schema {
        static readonly isStarwardsDesignState = false;
        @gameField('float32')
        bareField = 0;
    }

    it('accepts writes to @tweakable fields even without @commandable()', () => {
        const t = new GmSurface();
        JsonPointer.create('/tweakOnly').set(t, 5);
        expect(t.tweakOnly).to.equal(5);
    });

    it('still rejects bare @gameField properties (regression guard)', () => {
        const t = new GmSurface();
        expect(() => JsonPointer.create('/bareGameField').set(t, 9)).to.throw(/non-@commandable/);
        expect(t.bareGameField).to.equal(0);
    });

    it('inherits @tweakable through a Schema subclass chain', () => {
        const t = new GmSurfaceChild();
        JsonPointer.create('/tweakOnly').set(t, 3);
        expect(t.tweakOnly).to.equal(3);
    });

    it('accepts writes to any field on a DesignState subclass', () => {
        const t = new MyDesignState();
        JsonPointer.create('/param').set(t, 7);
        JsonPointer.create('/other').set(t, 11);
        expect(t.param).to.equal(7);
        expect(t.other).to.equal(11);
    });

    it('detects DesignState via the static marker on the constructor', () => {
        const t = new MyDesignState();
        expect((t.constructor as { isStarwardsDesignState?: boolean }).isStarwardsDesignState).to.equal(true);
    });

    it('does NOT treat a non-DesignState sibling as a DesignState', () => {
        const t = new Imposter();
        expect(() => JsonPointer.create('/bareField').set(t, 2)).to.throw(/non-@commandable/);
        expect(t.bareField).to.equal(0);
    });
});

// The GM tweak panel (`modules/browser/src/widgets/tweak.ts`) renders a
// writable slider for every @defectible factor of every ship system, so
// @defectible fields are implicitly part of the command surface — the
// whitelist must admit them the same way it admits @tweakable fields.
describe('JsonPointer @defectible admission', () => {
    class MyDesign extends DesignState {}

    class MySystem extends SystemState {
        readonly name = 'my system';
        @gameField(MyDesign) design = new MyDesign();
        get broken() {
            return false;
        }

        @range([0, 1])
        @defectible({ normal: 1, name: 'my factor' })
        @gameField('float32')
        factor = 1;

        @gameField('float32')
        bareField = 0;
    }

    it('accepts writes to @defectible fields even without @commandable()', () => {
        const t = new MySystem();
        JsonPointer.create('/factor').set(t, 0.5);
        expect(t.factor).to.be.closeTo(0.5, 0.01);
    });

    it('still rejects bare @gameField properties on a system (regression guard)', () => {
        const t = new MySystem();
        expect(() => JsonPointer.create('/bareField').set(t, 9)).to.throw(/non-@commandable/);
        expect(t.bareField).to.equal(0);
    });
});

// These tests cover @commandable(descendants) and @commandableSchema —
// the ancestor-walking admission pattern for nested Schema types.
// Mirrors the @range / @rangeSchema mechanism in range.ts.
describe('JsonPointer descendant admission (ancestor walk)', () => {
    // A simple nested Schema (like Vec2).
    class Point extends Schema {
        @gameField('float32')
        x = 0;

        @gameField('float32')
        y = 0;

        @gameField('float32')
        z = 0; // intentionally NOT admitted
    }

    // Container with property-level descendant admission.
    class Container extends Schema {
        @commandable({ '/x': true, '/y': true })
        @gameField(Point)
        pos: Point = new Point();

        @gameField(Point)
        otherPos: Point = new Point(); // no commandable annotation
    }

    // Container using class-level @commandableSchema.
    @commandableSchema({ '/namedPos/x': true, '/namedPos/y': true })
    class ClassLevelContainer extends Schema {
        @gameField(Point)
        namedPos: Point = new Point();
    }

    // Root → Container → Point traversal.
    class Root extends Schema {
        @commandable()
        @gameField('float32')
        topLevel = 0;

        @gameField(Container)
        nested: Container = new Container();
    }

    it('property-level @commandable({}) admits writes to named sub-paths', () => {
        const c = new Container();
        JsonPointer.create('/pos/x').set(c, 3);
        JsonPointer.create('/pos/y').set(c, 4);
        expect(c.pos.x).to.be.closeTo(3, 0.01);
        expect(c.pos.y).to.be.closeTo(4, 0.01);
    });

    it('property-level @commandable({}) does NOT admit unlisted sub-paths', () => {
        const c = new Container();
        expect(() => JsonPointer.create('/pos/z').set(c, 5)).to.throw(/non-@commandable/);
        expect(c.pos.z).to.equal(0);
    });

    it('a property with no descendant annotation still rejects sub-path writes', () => {
        const c = new Container();
        expect(() => JsonPointer.create('/otherPos/x').set(c, 1)).to.throw(/non-@commandable/);
    });

    it('@commandableSchema class-level admits writes through named descendant path', () => {
        const clc = new ClassLevelContainer();
        JsonPointer.create('/namedPos/x').set(clc, 7);
        JsonPointer.create('/namedPos/y').set(clc, 8);
        expect(clc.namedPos.x).to.be.closeTo(7, 0.01);
        expect(clc.namedPos.y).to.be.closeTo(8, 0.01);
    });

    it('@commandableSchema does NOT admit paths not listed', () => {
        const clc = new ClassLevelContainer();
        expect(() => JsonPointer.create('/namedPos/z').set(clc, 9)).to.throw(/non-@commandable/);
    });

    it('ancestor walk succeeds through a two-level path (root → nested → pos → x)', () => {
        const r = new Root();
        // /nested/pos/x: Container has @commandable({ '/x':true }) on pos
        JsonPointer.create('/nested/pos/x').set(r, 2);
        expect(r.nested.pos.x).to.be.closeTo(2, 0.01);
    });

    it('isCommandableFromAncestor reflects the stored metadata', () => {
        const c = new Container();
        const paths = { '/x': true, '/y': true } as CommandablePaths;
        // The metadata is on the prototype, but Reflect.getMetadata walks
        // the chain, so isCommandableFromAncestor should find it on an instance.
        expect(isCommandableFromAncestor(c, 'pos', '/x')).to.equal(true);
        expect(isCommandableFromAncestor(c, 'pos', '/y')).to.equal(true);
        expect(isCommandableFromAncestor(c, 'pos', '/z')).to.equal(false);
        // A property with no annotation at all returns false.
        expect(isCommandableFromAncestor(c, 'otherPos', '/x')).to.equal(false);
        void paths;
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
            @commandable()
            @gameField('float32')
            x = 0;
        }
        expect(() => JsonPointer.create('').set(new T(), 1)).to.throw(/root/);
    });
});
