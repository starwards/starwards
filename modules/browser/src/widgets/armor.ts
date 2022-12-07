import { Application, Graphics, Sprite, Texture, UPDATE_PRIORITY } from 'pixi.js';
import { ShipDriver, degToRad } from '@starwards/core';

import { Assets } from '@pixi/assets';
import { DashboardWidget } from './dashboard';
import WebFont from 'webfontloader';
import { WidgetContainer } from '../container';
import { radarVisibleBg } from '../colors';
import { rgb2hex } from '@pixi/utils';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

const plateMarginRadians = 3 * degToRad;
export function armorWidget(shipDriver: ShipDriver): DashboardWidget {
    class ArmorComponent {
        constructor(container: WidgetContainer) {
            drawArmorStatus(container, shipDriver);
        }
    }
    return {
        name: 'armor',
        type: 'component',
        component: ArmorComponent,
        defaultProps: {},
    };
}

export function drawArmorStatus(container: WidgetContainer, shipDriver: ShipDriver, minWidth = 0) {
    const size = () => Math.max(Math.min(container.width, container.height), minWidth);

    void Assets.load('images/dragonfly-armor.svg').then((texture: Texture) => {
        // initialization. extracted from CameraView
        const root = new Application<HTMLCanvasElement>({ backgroundColor: radarVisibleBg });
        root.view.setAttribute('data-id', 'Armor');
        container.on('resize', () => {
            root.renderer.resize(size(), size());
        });
        root.renderer.resize(size(), size());
        container.getElement().append(root.view);
        root.view.addEventListener('contextmenu', function (e) {
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
                const health =
                    shipDriver.state.armor.armorPlates[plateIdx].health / shipDriver.state.armor.design.plateMaxHealth;
                sprite.tint = rgb2hex([1 - health, health, 0]);
                sprite.height = size();
                sprite.width = size();

                const radius = size() / 2;
                mask.position.set(radius, radius);

                const x1 = Math.cos(angleStart) * radius;
                const y1 = Math.sin(angleStart) * radius;

                // Redraw mask
                mask.clear();
                mask.lineStyle(2, 0xff0000, 1);
                mask.beginFill(0xff0000, 1);
                mask.moveTo(0, 0);
                mask.lineTo(x1, y1);
                mask.arc(0, 0, Math.hypot(radius, radius), angleStart, angle, false);
                mask.lineTo(0, 0);
                mask.endFill();
            };

            root.ticker.add(draw, null, UPDATE_PRIORITY.LOW);

            root.stage.addChild(mask);
        }
    });
}
