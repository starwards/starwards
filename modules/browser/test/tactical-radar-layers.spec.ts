import { Faction, Projectile, ScanLevel, SpaceObject, Spaceship, degToRad } from '@starwards/core';
import { azimuthCircle, missileTargetLinesLayer } from '../src/radar/tactical-radar-layers';

jest.mock('pixi.js', () => {
    class Container {
        children: unknown[] = [];
        addChild<T>(child: T): T {
            this.children.push(child);
            return child;
        }
    }
    class Sprite extends Container {
        visible = true;
        anchor = { set: jest.fn() };
        position = { x: 0, y: 0 };
        rotation = 0;
        tint = 0;
        height = 0;
        width = 0;
        texture: unknown;
        constructor(texture?: unknown) {
            super();
            this.texture = texture;
        }
    }
    /** Records line draw calls so a test can read back what the layer painted. */
    class Graphics extends Container {
        ops: { op: string; x?: number; y?: number }[] = [];
        clear() {
            this.ops = [];
            return this;
        }
        moveTo(x: number, y: number) {
            this.ops.push({ op: 'moveTo', x, y });
            return this;
        }
        lineTo(x: number, y: number) {
            this.ops.push({ op: 'lineTo', x, y });
            return this;
        }
        stroke() {
            this.ops.push({ op: 'stroke' });
            return this;
        }
    }
    return {
        Container,
        Sprite,
        Graphics,
        Texture: { EMPTY: {}, from: jest.fn() },
        Assets: { load: jest.fn().mockResolvedValue({}) },
        UPDATE_PRIORITY: { LOW: 0 },
    };
});

type Root = Parameters<typeof azimuthCircle>[0];
type FakeSprite = { visible: boolean; rotation: number; position: { x: number; y: number } };

function fakeCameraView() {
    let tickCallback: ((delta: number) => void) | undefined;
    const root = {
        ticker: {
            add: (cb: (delta: number) => void) => {
                tickCallback = cb;
            },
        },
        worldToScreen: (w: { x: number; y: number }) => w,
        metersToPixles: (m: number) => m,
    } as unknown as Root;
    return { root, tick: () => tickCallback?.(1) };
}

describe('azimuthCircle (heading ring)', () => {
    // The ring must track whichever ship object the camera itself follows (the SpaceRoom-authoritative
    // object), not a separately-synced mirror — otherwise the two fall out of phase and the ring jitters
    // relative to the camera as the ship moves. A getter (rather than a fixed ShipState instance) lets the
    // caller swap in the same live object the camera uses, including the moment before it has resolved.
    test('stays hidden until the tracked ship resolves', () => {
        const { root, tick } = fakeCameraView();
        let ship: { position: { x: number; y: number }; angle: number } | undefined;
        const stage = azimuthCircle(
            root,
            () => ship,
            () => 5000,
        );
        const sprite = stage.children[0] as unknown as FakeSprite;

        tick();

        expect(sprite.visible).toBe(false);
    });

    test('rotation and position follow the getter every tick, not a value snapshotted at creation', () => {
        const { root, tick } = fakeCameraView();
        let ship = { position: { x: 10, y: 20 }, angle: 0 };
        const stage = azimuthCircle(
            root,
            () => ship,
            () => 5000,
        );
        const sprite = stage.children[0] as unknown as FakeSprite;

        tick();
        expect(sprite.visible).toBe(true);
        expect(sprite.rotation).toBeCloseTo(0, 5);
        expect(sprite.position.x).toBeCloseTo(10, 5);
        expect(sprite.position.y).toBeCloseTo(20, 5);

        ship = { position: { x: 30, y: 40 }, angle: 90 };
        tick();

        expect(sprite.rotation).toBeCloseTo(degToRad * -90, 5);
        expect(sprite.position.x).toBeCloseTo(30, 5);
        expect(sprite.position.y).toBeCloseTo(40, 5);
    });
});

describe('missileTargetLinesLayer (M4.44)', () => {
    type FakeGraphics = { ops: { op: string; x?: number; y?: number }[] };

    function missile(id: string, x: number, level: ScanLevel) {
        const m = new Projectile('HiExpMissile');
        m.id = id;
        m.position.x = x;
        m.position.y = 0;
        m.targetId = 'target';
        m.scanLevels[Number(Faction.Gravitas)] = level;
        return m;
    }

    function drawLines(objects: SpaceObject[]) {
        const target = new Spaceship();
        target.id = 'target';
        target.position.x = 500;
        target.position.y = 700;
        const all = [target, ...objects];
        const spaceDriver = {
            state: {
                getAll: (type: string) => all.filter((o) => o.type === type),
                get: (id: string) => all.find((o) => o.id === id),
            },
        } as unknown as Parameters<typeof missileTargetLinesLayer>[1];
        const { root, tick } = fakeCameraView();
        const graphics = missileTargetLinesLayer(
            root,
            spaceDriver,
            Faction.Gravitas,
            () => true,
        ) as unknown as FakeGraphics;
        tick();
        return graphics.ops;
    }

    test('a FULL missile draws a line from itself to its target', () => {
        expect(drawLines([missile('m', -100, ScanLevel.FULL)])).toEqual([
            { op: 'moveTo', x: -100, y: 0 },
            { op: 'lineTo', x: 500, y: 700 },
            { op: 'stroke' },
        ]);
    });

    test('a SNAPSHOT missile draws nothing', () => {
        expect(drawLines([missile('m', -100, ScanLevel.SNAPSHOT)])).toEqual([]);
    });
});
