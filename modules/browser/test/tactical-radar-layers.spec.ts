import { azimuthCircle } from '../src/radar/tactical-radar-layers';
import { degToRad } from '@starwards/core';

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
    class Graphics extends Container {}
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
