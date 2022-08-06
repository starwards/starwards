import { Application, Graphics, Loader, Sprite, UPDATE_PRIORITY } from 'pixi.js';

import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { ShipDriver } from '@starwards/model';
import WebFont from 'webfontloader';
import { degToRad } from '@starwards/model';
import { radarVisibleBg } from '../colors';
import { rgb2hex } from '@pixi/utils';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});
const preloadList = ['images/dragonfly-armor.svg'];

Loader.shared.add(preloadList);

const plateMarginRadians = 3 * degToRad;
export function armorWidget(shipDriver: ShipDriver): DashboardWidget {
    class ArmorComponent {
        constructor(container: Container) {
            const size = () => Math.min(container.width, container.height);

            Loader.shared.load(() => {
                // initialization. extracted from CameraView
                const root = new Application({ backgroundColor: radarVisibleBg });
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
                const texture = Loader.shared.resources['images/dragonfly-armor.svg'].texture; // assumed to be pre-loaded
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
                            shipDriver.state.armor.armorPlates[plateIdx].health / shipDriver.state.armor.plateMaxHealth;
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
    }
    return {
        name: 'armor',
        type: 'component',
        component: ArmorComponent,
        defaultProps: {},
    };
}
