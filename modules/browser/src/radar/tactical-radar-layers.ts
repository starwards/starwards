import {
    ChainGun,
    ShipState,
    XY,
    degToRad,
    getShellExplosionLocation,
    getTargetLocationAtShellExplosion,
} from '@starwards/core';
import { Container, Loader } from 'pixi.js';

import { CameraView } from './camera-view';
import { LineLayer } from './line-layer';
import { SelectionContainer } from './selection-container';
import { SpriteLayer } from './sprite-layer';
import { selectionColor } from '../colors';

const preloadList = ['images/radar/target.png', 'images/radar/deflection.png', 'images/asimuth-circle.svg'];

Loader.shared.add(preloadList);

export function azimuthCircle(root: CameraView, shipState: ShipState, rangeInMeters: () => number) {
    const stage = new Container();

    Loader.shared.load(() => {
        const layer = new SpriteLayer(
            root,
            {
                texture: Loader.shared.resources['images/asimuth-circle.svg'].texture,
                tint: 0xaaffaa,
            },
            () => shipState.position,
            () => degToRad * -shipState.angle,
            () => root.metersToPixles(rangeInMeters())
        );
        stage.addChild(layer.renderRoot);
    });
    return stage;
}

export function crosshairs(root: CameraView, shipState: ShipState, chainGun: ChainGun, shipTarget: SelectionContainer) {
    const stage = new Container();
    Loader.shared.load(() => {
        const shellCrosshairLayer = new SpriteLayer(
            root,
            {
                texture: Loader.shared.resources['images/radar/target.png'].texture,
                tint: 0xffaaaa,
            },
            () => getShellExplosionLocation(shipState, chainGun),
            () => 0,
            () => 32
        );
        const deflectionCrosshairLayer = new SpriteLayer(
            root,
            {
                texture: Loader.shared.resources['images/radar/deflection.png'].texture,
                tint: 0xaaaaff,
            },
            () => {
                const target = shipTarget.getSingle();
                return target && getTargetLocationAtShellExplosion(chainGun, target);
            },
            () => 0,
            () => 32
        );
        stage.addChild(deflectionCrosshairLayer.renderRoot);
        stage.addChild(shellCrosshairLayer.renderRoot);
    });
    return stage;
}
export function speedLines(root: CameraView, shipState: ShipState, shipTarget: SelectionContainer) {
    const stage = new Container();
    const targetLineLayer = new LineLayer(root, () => [shipState.position, shipTarget.getSingle()?.position], {
        width: 2,
        color: selectionColor,
        alpha: 0.5,
    });
    root.addLayer(targetLineLayer.renderRoot);
    const speedLineLayer = new LineLayer(
        root,
        () => [shipState.position, XY.add(shipState.position, shipState.velocity)],
        {
            width: 2,
            color: 0x26fd9a,
            alpha: 0.5,
        }
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
        {
            width: 2,
            color: 0x26cbcb,
            alpha: 0.5,
        }
    );
    stage.addChild(speedLineLayer.renderRoot);
    stage.addChild(targetSpeedLineLayer.renderRoot);
    return stage;
}
