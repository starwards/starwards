import {
    ChainGun,
    ShipState,
    XY,
    degToRad,
    getShellExplosionLocation,
    getTargetLocationAtShellExplosion,
} from '@starwards/core';
import { Container, Texture } from 'pixi.js';

import { Assets } from '@pixi/assets';
import { CameraView } from './camera-view';
import { LineLayer } from './line-layer';
import { SelectionContainer } from './selection-container';
import { SpriteLayer } from './sprite-layer';
import { selectionColor } from '../colors';

export function azimuthCircle(root: CameraView, shipState: ShipState, rangeInMeters: () => number) {
    const stage = new Container();
    const layer = new SpriteLayer(
        root,
        { tint: 0xaaffaa },
        () => shipState.position,
        () => degToRad * -shipState.angle,
        () => root.metersToPixles(rangeInMeters())
    );
    stage.addChild(layer.renderRoot);
    void Assets.load('images/asimuth-circle.svg').then((texture: Texture) => {
        layer.texture = texture;
    });
    return stage;
}

export function crosshairs(root: CameraView, shipState: ShipState, chainGun: ChainGun, shipTarget: SelectionContainer) {
    const stage = new Container();
    const shellCrosshairLayer = new SpriteLayer(
        root,
        { tint: 0xffaaaa },
        () => getShellExplosionLocation(shipState, chainGun),
        () => 0,
        () => 32
    );
    stage.addChild(shellCrosshairLayer.renderRoot);
    void Assets.load('images/radar/target.png').then((texture: Texture) => {
        shellCrosshairLayer.texture = texture;
    });
    const deflectionCrosshairLayer = new SpriteLayer(
        root,
        { tint: 0xaaaaff },
        () => {
            const target = shipTarget.getSingle();
            return target && getTargetLocationAtShellExplosion(chainGun, target);
        },
        () => 0,
        () => 32
    );
    stage.addChild(deflectionCrosshairLayer.renderRoot);
    void Assets.load('images/radar/deflection.png').then((texture: Texture) => {
        deflectionCrosshairLayer.texture = texture;
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
