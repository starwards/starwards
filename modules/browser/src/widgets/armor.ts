import { Application, Graphics, Loader, Sprite } from 'pixi.js';

import { Container } from 'golden-layout';
import { DashboardWidget } from './dashboard';
import { ShipDriver } from '../driver';
import WebFont from 'webfontloader';
import { radarVisibleBg } from '../colors';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});
export const preloadList = ['images/test-circle.svg'];

Loader.shared.add(preloadList);

const sizeFactor = 0.95;
const plateMarginFactor = 0.1;
export function armorWidget(_shipDriver: ShipDriver): DashboardWidget {
    class ArmorComponent {
        constructor(container: Container) {
            const size = () => Math.min(container.width, container.height) * sizeFactor;

            Loader.shared.load(() => {
                // initialization. extracted from CameraView
                const root = new Application({ backgroundColor: radarVisibleBg });
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
                const texture = Loader.shared.resources['images/test-circle.svg'].texture; // assumed to be pre-loaded
                const numOfPlates = 12;
                const plateSize = (2 * Math.PI) / numOfPlates;
                for (let plateNum = 0; plateNum < numOfPlates; plateNum++) {
                    const sprite = new Sprite(texture);

                    sprite.position.x = 0;
                    sprite.position.y = 0;
                    container.on('resize', () => {
                        sprite.height = size();
                        sprite.width = size();
                    });
                    sprite.roundPixels = false;
                    root.stage.addChild(sprite);
                    // --
                    const mask = new Graphics();
                    sprite.mask = mask;
                    // window.mask = mask;

                    // --
                    const angleStart = 0 - Math.PI / 2 + plateNum * plateSize + plateMarginFactor / 2;
                    const angle = (1 - plateMarginFactor) * plateSize + angleStart;
                    const draw = () => {
                        mask.position.set(size() / 2, size() / 2);
                        const radius = size();

                        const x1 = Math.cos(angleStart) * radius;
                        const y1 = Math.sin(angleStart) * radius;

                        // Redraw mask
                        mask.clear();
                        mask.lineStyle(2, 0xff0000, 1);
                        mask.beginFill(0xff0000, 1);
                        mask.moveTo(0, 0);
                        mask.lineTo(x1, y1);
                        mask.arc(0, 0, radius, angleStart, angle, false);
                        mask.lineTo(0, 0);
                        mask.endFill();
                    };

                    container.on('resize', draw);
                    draw();
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
