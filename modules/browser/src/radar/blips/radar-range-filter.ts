import { DeepReadonly, noop } from 'ts-essentials';
import { FieldOfView, SpaceDriver, SpaceObject, XY, degToRad, getSpatialIndex } from '@starwards/core';

import { CameraView } from '../camera-view';
import { Graphics } from 'pixi.js';
import { TrackObjects } from '../track-objects';

class DrawableFieldOfView extends FieldOfView {
    draw(parent: CameraView, fovGraphics: Graphics) {
        const view = this.view;
        const objectScreenPos = parent.worldToScreen(this.object.position);
        const lastArc = view[view.length - 1];
        const lastArcEnd = parent.worldToScreen(
            XY.add(this.object.position, XY.byLengthAndDirection(lastArc.distance, lastArc.toAngle)),
        );
        fovGraphics.moveTo(lastArcEnd.x, lastArcEnd.y);
        for (const visibleArc of view) {
            const arcStart = parent.worldToScreen(
                XY.add(this.object.position, XY.byLengthAndDirection(visibleArc.distance, visibleArc.fromAngle)),
            );
            fovGraphics.lineTo(arcStart.x, arcStart.y);
            fovGraphics.arc(
                objectScreenPos.x,
                objectScreenPos.y,
                parent.metersToPixles(visibleArc.distance),
                degToRad * (visibleArc.fromAngle - parent.camera.angle),
                degToRad * (visibleArc.toAngle - parent.camera.angle),
            );
        }
    }
}
export class RadarRangeFilter {
    public visibleObjects = new Set<DeepReadonly<SpaceObject>>();
    private spatial = getSpatialIndex(this.spaceDriver);
    private createFieldOfView = (o: SpaceObject) => new DrawableFieldOfView(this.spatial, o);
    private updateFieldOfView = (_: SpaceObject, r: DrawableFieldOfView) => r.setDirty();
    private fovs = new TrackObjects<DrawableFieldOfView>(
        this.spaceDriver,
        this.createFieldOfView,
        this.updateFieldOfView,
        noop,
        this.shouldTrackFov as (o: SpaceObject) => o is SpaceObject,
    );
    constructor(
        private spaceDriver: SpaceDriver,
        private shouldTrackFov?: (o: SpaceObject) => boolean,
    ) {}

    public update = () => {
        this.visibleObjects.clear();
        this.fovs.update();
        for (const fov of this.fieldsOfView()) {
            this.visibleObjects.add(fov.object);
            for (const visibleArc of fov.view) {
                visibleArc.object && visibleArc.object.isRadarContact && this.visibleObjects.add(visibleArc.object);
            }
        }
        // a nebula is a visible optical hazard, not a scanned contact: every radar shows it
        // regardless of field of view, so crews can navigate around it.
        for (const nebula of this.spaceDriver.state.getAll('Nebula')) {
            this.visibleObjects.add(nebula);
        }
    };

    public fieldsOfView() {
        return this.fovs.values();
    }

    public isInRange = (obj: SpaceObject) => {
        return this.visibleObjects.has(obj);
    };
}
