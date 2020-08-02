import { SpaceObject, XY, ShipState, SpaceState } from '@starwards/model';
import { Container } from 'golden-layout';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { getGlobalRoom, getRoomById, NamedGameRoom } from '../client';
import { blipRenderer } from '../radar/blip-renderer';
import { Camera } from '../radar/camera';
import { CameraView } from '../radar/camera-view';
import { InteractiveLayer } from '../radar/interactive-layer';
import { LineLayer } from '../radar/line-layer';
import { ObjectsLayer } from '../radar/objects-layer';
import { RangeIndicators } from '../radar/range-indicators';
import { SelectionContainer } from '../radar/selection-container';
import { DashboardWidget } from './dashboard';
import { SpriteLayer } from '../radar/sprite-layer';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

export const preloadList = ['images/crosshair1.png'];

PIXI.Loader.shared.add(preloadList);

const sizeFactor = 0.85; // 15% left for azimut circle
const sizeFactorGrace = 0.005;

function tacticalRadarComponent(container: Container, state: Props) {
    const camera = new Camera();
    camera.bindRange(container, sizeFactor - sizeFactorGrace, state);

    PIXI.Loader.shared.load(async () => {
        const root = new CameraView({ backgroundColor: 0x0f0f0f }, camera, container);
        root.setSquare();
        const range = new RangeIndicators(root, 1000);
        range.setSizeFactor(sizeFactor);
        root.addLayer(range.renderRoot);
        const [spaceRoom, shipRoom] = await Promise.all([getGlobalRoom('space'), getRoomById('ship', state.subjectId)]);
        const shipTarget = trackTargetObject(spaceRoom.state, shipRoom.state);

        const crosshairLayer = new SpriteLayer(
            root,
            {
                fileName: 'images/crosshair1.png',
                tint: 0xffaaaa,
                size: 32,
            },
            () => {
                const fireAngle = shipRoom.state.angle + shipRoom.state.chainGun.angle;
                const fireSource = XY.add(
                    shipRoom.state.position,
                    XY.rotate({ x: shipRoom.state.radius, y: 0 }, fireAngle)
                );
                const fireVelocity = XY.add(
                    shipRoom.state.velocity,
                    XY.rotate({ x: shipRoom.state.chainGun.bulletSpeed, y: 0 }, fireAngle)
                );
                const fireTime = shipRoom.state.chainGun.shellSecondsToLive;
                return XY.add(fireSource, XY.scale(fireVelocity, fireTime));
            }
        );
        root.addLayer(crosshairLayer.renderRoot);
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
                    const fireTime = shipRoom.state.chainGun.shellSecondsToLive;
                    return XY.add(target.position, XY.scale(target.velocity, fireTime));
                } else {
                    return undefined;
                }
            }
        );
        root.addLayer(deflectionCrosshairLayer.renderRoot);
        const targetLineLayer = new LineLayer(root, () => [shipRoom.state.position, shipTarget.getSingle()?.position], [
            2,
            InteractiveLayer.selectionColor,
            0.5,
        ]);
        root.addLayer(targetLineLayer.renderRoot);
        const speedLineLayer = new LineLayer(
            root,
            () => [shipRoom.state.position, XY.add(shipRoom.state.position, shipRoom.state.velocity)],
            [2, 0x26fd9a, 0.5]
        );
        root.addLayer(speedLineLayer.renderRoot);
        const targetSpeedLineLayer = new LineLayer(
            root,
            () => {
                const target = shipTarget.getSingle();
                return [
                    shipRoom.state.position,
                    target && XY.add(shipRoom.state.position, XY.difference(shipRoom.state.velocity, target.velocity)),
                ];
            },
            [2, 0x26cbcb, 0.5]
        );
        root.addLayer(targetSpeedLineLayer.renderRoot);
        const blipLayer = new ObjectsLayer(root, spaceRoom, blipRenderer, shipTarget);
        root.addLayer(blipLayer.renderRoot);
        trackObject(camera, spaceRoom, state.subjectId);
    });
}

function trackTargetObject(space: SpaceState, ship: ShipState): SelectionContainer {
    const result = new SelectionContainer(space);
    const updateSelectedTarget = () => {
        const targetObj = ship.targetId && space.get(ship.targetId);
        result.set(targetObj ? [targetObj] : []);
    };
    ship.events.on('targetId', updateSelectedTarget);
    space.events.on('add', () => setTimeout(updateSelectedTarget, 0));
    updateSelectedTarget();
    return result;
}

function trackObject(camera: Camera, room: NamedGameRoom<'space'>, subjectId: string) {
    let tracked = room.state.get(subjectId);
    if (tracked) {
        camera.followSpaceObject(tracked, room.state.events, true);
    } else {
        room.state.events.on('add', (spaceObject: SpaceObject) => {
            if (!tracked && spaceObject.id === subjectId) {
                tracked = spaceObject;
                camera.followSpaceObject(tracked, room.state.events, true);
            }
        });
    }
}

export type Props = { range: number; subjectId: string };
export const tacticalRadarWidget: DashboardWidget<Props> = {
    name: 'tactical radar',
    type: 'component',
    component: tacticalRadarComponent,
    defaultProps: { range: 5000 },
};
