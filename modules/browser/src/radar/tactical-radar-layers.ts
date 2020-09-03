import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';
import { SpriteLayer } from './sprite-layer';
import { XY, ShipState, getShellExplosionLocation, getTargetLocationAtShellExplosion } from '@starwards/model';
import { LineLayer } from './line-layer';
import { InteractiveLayer } from './interactive-layer';

export function crosshairs(root: CameraView, shipState: ShipState, shipTarget: SelectionContainer) {
    const stage = new PIXI.Container();
    const shellCrosshairLayer = new SpriteLayer(
        root,
        {
            fileName: 'images/crosshair1.png',
            tint: 0xffaaaa,
            size: 32,
        },
        () => getShellExplosionLocation(shipState)
    );
    const deflectionCrosshairLayer = new SpriteLayer(
        root,
        {
            fileName: 'images/crosshair1.png',
            tint: 0xaaaaff,
            size: 32,
        },
        () => {
            const target = shipTarget.getSingle();
            return target && getTargetLocationAtShellExplosion(shipState, target);
        }
    );
    stage.addChild(deflectionCrosshairLayer.renderRoot);
    stage.addChild(shellCrosshairLayer.renderRoot);
    return stage;
}
export function speedLines(root: CameraView, shipState: ShipState, shipTarget: SelectionContainer) {
    const stage = new PIXI.Container();
    const targetLineLayer = new LineLayer(root, () => [shipState.position, shipTarget.getSingle()?.position], [
        2,
        InteractiveLayer.selectionColor,
        0.5,
    ]);
    root.addLayer(targetLineLayer.renderRoot);
    const speedLineLayer = new LineLayer(
        root,
        () => [shipState.position, XY.add(shipState.position, shipState.velocity)],
        [2, 0x26fd9a, 0.5]
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
        [2, 0x26cbcb, 0.5]
    );
    stage.addChild(speedLineLayer.renderRoot);
    stage.addChild(targetSpeedLineLayer.renderRoot);
    return stage;
}
