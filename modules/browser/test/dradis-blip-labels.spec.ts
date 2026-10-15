import { Derelict, Faction, ScanLevel, Spaceship, Vec2, objectDisplayName } from '@starwards/core';
import { dradisDrawFunctions, dradisNoRadiusDrawFunctions } from '../src/radar/blips/blip-renderer';
import { Container } from 'pixi.js';

jest.mock('pixi.js', () => {
    class FakeContainer {
        children: unknown[] = [];
        label = '';
        visible = true;
        addChild<T>(child: T): T {
            this.children.push(child);
            return child;
        }
    }
    class Sprite extends FakeContainer {
        anchor = { set: jest.fn() };
        angle = 0;
        tint = 0;
        alpha = 1;
        height = 0;
        width = 0;
    }
    class Graphics extends FakeContainer {
        clear() {
            return this;
        }
        circle() {
            return this;
        }
        stroke() {
            return this;
        }
    }
    class Text extends FakeContainer {
        x = 0;
        y = 0;
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

type Node = { label: string; visible: boolean; children: Node[]; text?: string };

function render(
    renderers: typeof dradisDrawFunctions | typeof dradisNoRadiusDrawFunctions,
    o: Spaceship | Derelict,
    scanLevel: ScanLevel,
) {
    const stage = new Container();
    const Renderer = Spaceship.isInstance(o) ? renderers.Spaceship : renderers.Derelict;
    const renderer = new Renderer(stage, 64, o as never);
    const parent = { camera: { angle: 0 }, metersToPixles: (m: number) => m };
    renderer.redraw(o as never, {
        isSelected: false,
        color: 0,
        alpha: 1,
        stage,
        parent: parent as never,
        blipSize: 64,
        scanLevel,
    });
    const children = (stage as unknown as Node).children;
    return {
        label: children.find((c) => c.label === 'blip-label')!,
        direction: children.find((c) => c.label === 'direction-sprite'),
    };
}

function ship(callsign: string) {
    const s = new Spaceship();
    s.id = 'ship-7';
    s.callsign = callsign;
    s.faction = Faction.Raiders;
    return s;
}

describe('Dradis blip labels and heading (SPEC-0007 D1, D2)', () => {
    it.each([
        ['with a callsign', ship('Viper')],
        ['without a callsign', ship('')],
    ])('a Dradis ship %s is labelled with objectDisplayName', (_, s) => {
        const { label } = render(dradisNoRadiusDrawFunctions, s, ScanLevel.BASIC);
        expect(label.visible).toBe(true);
        expect(label.text).toBe(objectDisplayName(s, s.id, ScanLevel.BASIC));
        expect(label.text).not.toContain('ID:');
    });

    it('a Dradis derelict is labelled with objectDisplayName', () => {
        const d = new Derelict().init('wreck-3', Vec2.make({ x: 0, y: 0 }), 50, Faction.NONE, 'Hulk', 0, null);
        const { label } = render(dradisNoRadiusDrawFunctions, d, ScanLevel.BASIC);
        expect(label.text).toBe('Hulk (wreck)');
    });

    it('an unscanned Dradis contact has no label', () => {
        const { label } = render(dradisNoRadiusDrawFunctions, ship('Viper'), ScanLevel.UFO);
        expect(label.visible).toBe(false);
    });

    it('a Dradis ship has no visible heading sprite at any scan level', () => {
        for (const level of [ScanLevel.UFO, ScanLevel.BASIC, ScanLevel.SNAPSHOT]) {
            expect(render(dradisNoRadiusDrawFunctions, ship('Viper'), level).direction?.visible).toBe(false);
        }
    });

    it('the radius-showing variants used by GM/ship radars keep heading and id label', () => {
        const s = ship('Viper');
        const { label, direction } = render(dradisDrawFunctions, s, ScanLevel.BASIC);
        expect(direction?.visible).toBe(true);
        expect(label.text).toBe('ID: ship-7');
    });
});
