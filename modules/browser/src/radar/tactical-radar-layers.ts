import { ShipState, XY, getShellExplosionLocation, getTargetLocationAtShellExplosion } from '@starwards/model';

import { CameraView } from './camera-view';
import { Container } from 'pixi.js';
import { InteractiveLayer } from './interactive-layer';
import { LineLayer } from './line-layer';
import { SelectionContainer } from './selection-container';
import { SpriteLayer } from './sprite-layer';

export function crosshairs(root: CameraView, shipState: ShipState, shipTarget: SelectionContainer) {
    const stage = new Container();
    const shellCrosshairLayer = new SpriteLayer(
        root,
        {
            fileName: 'images/crosshair1.png',
            tint: 0xffaaaa,
            sizePx: 32,
        },
        () => getShellExplosionLocation(shipState),
        () => 0
    );
    const deflectionCrosshairLayer = new SpriteLayer(
        root,
        {
            fileName: 'images/crosshair1.png',
            tint: 0xaaaaff,
            sizePx: 32,
        },
        () => {
            const target = shipTarget.getSingle();
            return target && getTargetLocationAtShellExplosion(shipState, target);
        },
        () => 0
    );
    stage.addChild(deflectionCrosshairLayer.renderRoot);
    stage.addChild(shellCrosshairLayer.renderRoot);
    return stage;
}
export function speedLines(root: CameraView, shipState: ShipState, shipTarget: SelectionContainer) {
    const stage = new Container();
    const targetLineLayer = new LineLayer(root, () => [shipState.position, shipTarget.getSingle()?.position], {
        width: 2,
        color: InteractiveLayer.selectionColor,
        alpha: 0.5,
    });
    root.addLayer(targetLineLayer.renderRoot);
    const speedLineLayer = new LineLayer(
        root,
        () => [shipState.position, XY.add(shipState.position, shipState.velocity)],
        { width: 2, color: 0x26fd9a, alpha: 0.5 }
    );
    const targetSpeedLineLayer = new LineLayer(
        root,
        () => {
            const target = shipTarget.getSingle();
            return [
                shipState.position,
                target && XY.add(shipState.position, XY.difference(shipState.velocity, target.velocity)),
            ];
        },
        { width: 2, color: 0x26cbcb, alpha: 0.5 }
    );
    stage.addChild(speedLineLayer.renderRoot);
    stage.addChild(targetSpeedLineLayer.renderRoot);
    return stage;
}
