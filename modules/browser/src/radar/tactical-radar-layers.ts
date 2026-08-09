import { Assets, Container, Graphics, Texture, UPDATE_PRIORITY } from 'pixi.js';
import {
    ChainGun,
    ShipState,
    XY,
    degToRad,
    getShellExplosionLocation,
    getTargetLocationAtShellExplosion,
} from '@starwards/core';

import { radar, selectionColor } from '../colors';
import { CameraView } from './camera-view';
import { LineLayer } from './line-layer';
import { SelectionContainer } from './selection-container';
import { SpriteLayer } from './sprite-layer';

/**
 * `getShip` must resolve to the same live object the radar's camera follows (the SpaceRoom-authoritative
 * SpaceObject), not the ShipState mirror — the mirror is synced over a separate Colyseus room connection
 * and drifts out of phase with the camera, making the ring jitter relative to it as the ship moves.
 */
export function azimuthCircle(
    root: CameraView,
    getShip: () => { position: XY; angle: number } | undefined,
    rangeInMeters: () => number,
) {
    const stage = new Container();
    const layer = new SpriteLayer(
        root,
        { tint: radar.azimuthTint },
        () => getShip()?.position,
        () => degToRad * -(getShip()?.angle ?? 0),
        () => root.metersToPixles(rangeInMeters()),
    );
    stage.addChild(layer.renderRoot);
    void Assets.load('images/asimuth-circle.svg').then((_texture: Texture) => {
        const texture = Texture.from('images/asimuth-circle.svg'); // SVG bug https://github.com/pixijs/pixijs/issues/8694#issuecomment-1320702841
        layer.texture = texture;
    });
    return stage;
}

export function crosshairs(root: CameraView, shipState: ShipState, chainGun: ChainGun, shipTarget: SelectionContainer) {
    const stage = new Container();
    const shellCrosshairLayer = new SpriteLayer(
        root,
        { tint: radar.shellTint },
        () => getShellExplosionLocation(shipState, chainGun),
        () => 0,
        () => 32,
    );
    stage.addChild(shellCrosshairLayer.renderRoot);
    void Assets.load('images/radar/target.png').then((texture: Texture) => {
        shellCrosshairLayer.texture = texture;
    });
    const deflectionCrosshairLayer = new SpriteLayer(
        root,
        { tint: radar.deflectionTint },
        () => {
            const target = shipTarget.getSingle();
            return target && getTargetLocationAtShellExplosion(chainGun, target);
        },
        () => 0,
        () => 32,
    );
    stage.addChild(deflectionCrosshairLayer.renderRoot);
    void Assets.load('images/radar/deflection.png').then((texture: Texture) => {
        deflectionCrosshairLayer.texture = texture;
    });
    return stage;
}

/**
 * A mount's arc is a fixed structural limit, as fitted — unlike the scan beam's live sweep, it
 * ignores `bearingSkew` and the mount's current `bearing`. `bearingLimit: 0` draws as a single line
 * (a bolted mount with no traverse) and `bearingLimit: 180` as a full circle (unrestricted), rather
 * than degenerating to an invisible wedge at either extreme.
 */
export function mountArc(root: CameraView, shipState: ShipState, chainGun: ChainGun) {
    const graphics = new Graphics();
    root.ticker.add(
        () => {
            graphics.clear();
            const center = root.worldToScreen(shipState.position);
            const radiusPixels = root.metersToPixles(chainGun.design.maxShellRange);
            const centerAngle = degToRad * (shipState.angle + chainGun.fittedBearing - root.camera.angle);
            const bearingLimit = chainGun.design.bearingLimit;
            if (bearingLimit <= 0) {
                const to = {
                    x: center.x + radiusPixels * Math.cos(centerAngle),
                    y: center.y + radiusPixels * Math.sin(centerAngle),
                };
                graphics.moveTo(center.x, center.y).lineTo(to.x, to.y);
            } else if (bearingLimit >= 180) {
                graphics.circle(center.x, center.y, radiusPixels);
            } else {
                const bearingLimitRad = degToRad * bearingLimit;
                graphics.moveTo(center.x, center.y);
                graphics.arc(
                    center.x,
                    center.y,
                    radiusPixels,
                    centerAngle - bearingLimitRad,
                    centerAngle + bearingLimitRad,
                );
                graphics.lineTo(center.x, center.y);
            }
            graphics.stroke({ width: 1, color: radar.mountArc, alpha: 0.5 });
        },
        null,
        UPDATE_PRIORITY.LOW,
    );
    return graphics;
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
            color: radar.speedLine,
            alpha: 0.5,
        },
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
            color: radar.targetSpeedLine,
            alpha: 0.5,
        },
    );
    stage.addChild(speedLineLayer.renderRoot);
    stage.addChild(targetSpeedLineLayer.renderRoot);
    return stage;
}
