import { CameraView } from './camera-view';
import { SelectionContainer } from './selection-container';
import { SpriteLayer } from './sprite-layer';
import { XY, ShipState } from '@starwards/model';
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
        () => {
            const fireAngle = shipState.angle + shipState.chainGun.angle;
            const fireSource = XY.add(shipState.position, XY.rotate({ x: shipState.radius, y: 0 }, fireAngle));
            const fireVelocity = XY.rotate({ x: shipState.chainGun.bulletSpeed, y: 0 }, fireAngle);

            const fireTime = shipState.chainGun.shellSecondsToLive;
            return XY.add(fireSource, XY.scale(fireVelocity, fireTime));
        }
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
            if (target) {
                const fireTime = shipState.chainGun.shellSecondsToLive;
                return XY.add(target.position, XY.scale(XY.difference(target.velocity, shipState.velocity), fireTime));
            } else {
                return undefined;
            }
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
