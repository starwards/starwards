import { MissileAmmoType, Projectile, ScanLevel, missileAmmoTypes } from '@starwards/core';
import { missileGenericCode, missileWarheadPaint } from '../src/colors';
import { Container } from 'pixi.js';
import { tacticalDrawFunctions } from '../src/radar/blips/blip-renderer';

jest.mock('pixi.js', () => {
    class FakeContainer {
        children: unknown[] = [];
        label = '';
        visible = true;
        alpha = 1;
        addChild<T>(child: T): T {
            this.children.push(child);
            return child;
        }
    }
    class Sprite extends FakeContainer {
        anchor = { set: jest.fn() };
        tint = 0;
        height = 0;
        width = 0;
    }
    /** Records each draw call so a test can read back what a blip painted. */
    class Graphics extends FakeContainer {
        ops: { op: string; arg?: unknown }[] = [];
        clear() {
            this.ops = [];
            return this;
        }
        circle() {
            this.ops.push({ op: 'circle' });
            return this;
        }
        poly() {
            this.ops.push({ op: 'poly' });
            return this;
        }
        fill(arg: unknown) {
            this.ops.push({ op: 'fill', arg });
            return this;
        }
        stroke(arg: unknown) {
            this.ops.push({ op: 'stroke', arg });
            return this;
        }
    }
    class Text extends FakeContainer {
        x = 0;
        y = 0;
        style = { fill: 0 };
        constructor(public text: string) {
            super();
        }
        getLocalBounds() {
            return { width: 0 };
        }
    }
    class TextStyle {}
    return {
        Container: FakeContainer,
        Sprite,
        Graphics,
        Text,
        TextStyle,
        Texture: { from: jest.fn() },
        Assets: { addBundle: jest.fn(), loadBundle: jest.fn(() => new Promise(() => undefined)) },
    };
});

type Op = { op: string; arg?: { color?: number; alpha?: number } };
type Node = { label: string; visible: boolean; children: Node[]; text?: string; ops?: Op[] };

const FACTION_COLOR = 0x123456;

/** What a projectile blip painted: its shape and label text ('' when hidden). */
function paint(o: Projectile, scanLevel: ScanLevel) {
    const stage = new Container();
    const renderer = new tacticalDrawFunctions.Projectile(stage, 64);
    const parent = { camera: { angle: 0 }, metersToPixles: (m: number) => m };
    renderer.redraw(o, {
        isSelected: false,
        color: FACTION_COLOR,
        alpha: 1,
        stage,
        parent: parent as never,
        blipSize: 64,
        scanLevel,
    });
    const children = (stage as unknown as Node).children;
    const ops = children.flatMap((c) => c.ops ?? []);
    const label = children.find((c) => c.label === 'blip-label')!;
    const visibleFills = ops.filter((op) => op.op === 'fill' && op.arg?.alpha !== 0);
    return {
        shape: ops.some((op) => op.op === 'poly') ? 'diamond' : 'dot',
        fillColors: visibleFills.map((op) => op.arg?.color),
        label: label.visible ? label.text : '',
    };
}

const missile = (model: MissileAmmoType) => new Projectile(model);

describe('missile threat paint on tactical radars (M4.26)', () => {
    test('UFO: an unscanned missile is the same plain dot as any unknown contact', () => {
        expect(paint(missile('FragMissile'), ScanLevel.UFO)).toEqual({
            shape: 'dot',
            fillColors: [FACTION_COLOR],
            label: '',
        });
    });

    test('BASIC: every warhead paints the same generic missile', () => {
        const painted = missileAmmoTypes.map((m) => paint(missile(m), ScanLevel.BASIC));
        for (const p of painted) {
            expect(p).toEqual({ shape: 'diamond', fillColors: [], label: missileGenericCode });
        }
    });

    test.each([ScanLevel.SNAPSHOT, ScanLevel.FULL])('scan level %s: each warhead has its own paint', (level) => {
        const painted = missileAmmoTypes.map((m) => paint(missile(m), level));
        missileAmmoTypes.forEach((m, i) => {
            expect(painted[i]).toEqual({
                shape: 'diamond',
                fillColors: [missileWarheadPaint[m].color],
                label: missileWarheadPaint[m].code,
            });
        });
        expect(new Set(painted.map((p) => p.label)).size).toBe(missileAmmoTypes.length);
        expect(new Set(painted.map((p) => p.fillColors[0])).size).toBe(missileAmmoTypes.length);
    });

    test('a cannon shell stays a plain dot whatever is known about it', () => {
        expect(paint(new Projectile('HiExpShell'), ScanLevel.FULL).shape).toBe('dot');
    });
});
