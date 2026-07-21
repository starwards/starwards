import { Application, Assets, Graphics, Sprite, Texture, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, degToRad } from '@starwards/core';

import { DashboardWidget } from './dashboard';
import WebFont from 'webfontloader';
import { WidgetContainer } from '../container';
import { radarVisibleBg } from '../colors';

const rgb2hex = (rgb: number[]) => {
    const r = Math.round(rgb[0] * 255);
    const g = Math.round(rgb[1] * 255);
    const b = Math.round(rgb[2] * 255);
    return (r << 16) | (g << 8) | b;
};

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const plateMarginRadians = 3 * degToRad;
export function armorWidget(shipDriver: ShipDriver): DashboardWidget {
    class ArmorComponent {
        constructor(container: WidgetContainer) {
            void drawArmorStatus(container, shipDriver);
        }
    }
    return {
        name: 'armor',
        type: 'component',
        component: ArmorComponent,
        defaultProps: {},
    };
}

export async function drawArmorStatus(
    container: WidgetContainer,
    shipDriver: ShipDriver,
    minWidth = 0,
): Promise<Application> {
    const size = () => Math.max(Math.min(container.width, container.height), minWidth);
    await Assets.load('images/dragonfly-armor.svg');
    {
        const texture = Texture.from('images/dragonfly-armor.svg'); // SVG bug https://github.com/pixijs/pixijs/issues/8694#issuecomment-1320702841
        // initialization. extracted from CameraView
        const root = new Application();
        await root.init({ backgroundColor: radarVisibleBg, preserveDrawingBuffer: true });
        root.canvas.setAttribute('data-id', 'Armor');
        container.on('resize', () => {
            root.renderer.resize(size(), size());
        });
        root.renderer.resize(size(), size());
        container.getElement().append(root.canvas);
        root.canvas.setAttribute('data-loaded', 'false');
        root.canvas.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            return false;
        });
        // ---
        const plateSize = degToRad * shipDriver.state.armor.degreesPerPlate;

        for (let plateIdx = 0; plateIdx < shipDriver.state.armor.numberOfPlates; plateIdx++) {
            const sprite = new Sprite(texture);

            sprite.position.x = 0;
            sprite.position.y = 0;
            sprite.roundPixels = false;
            root.stage.addChild(sprite);
            const mask = new Graphics();
            sprite.mask = mask;
            const angleStart = 0 - Math.PI / 2 + plateIdx * plateSize + plateMarginRadians / 2;
            const angle = angleStart + plateSize - plateMarginRadians;
            const draw = () => {
                const health = shipDriver.state.armor.armorPlates[plateIdx].healthRatio;
                sprite.tint = rgb2hex([1 - health, health, 0]);
                sprite.height = size();
                sprite.width = size();

                const radius = size() / 2;
                mask.position.set(radius, radius);

                const x1 = Math.cos(angleStart) * radius;
                const y1 = Math.sin(angleStart) * radius;

                // Redraw mask
                mask.clear();
                mask.moveTo(0, 0);
                mask.lineTo(x1, y1);
                mask.arc(0, 0, Math.hypot(radius, radius), angleStart, angle, false);
                mask.lineTo(0, 0);
                mask.fill({ color: 0xff0000, alpha: 1 });
                mask.stroke({ color: 0xff0000, width: 2, alpha: 1 });
            };

            root.ticker.add(draw, null, UPDATE_PRIORITY.LOW);

            root.stage.addChild(mask);
        }

        root.ticker.addOnce(
            () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        root.canvas.setAttribute('data-loaded', 'true');
                    });
                });
            },
            null,
            UPDATE_PRIORITY.LOW + 1,
        );

        return root;
    }
}
