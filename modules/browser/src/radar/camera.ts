import { SpaceObject, XY } from '@starwards/model';
// tslint:disable-next-line: no-implicit-dependencies
import { DataChange } from '@colyseus/schema';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';

export interface Screen {
    width: number;
    height: number;
}
export class Camera {
    private static readonly minZoom = 0.00005; // must be > 0 to avoid division errors
    private static readonly maxZoom = 1;
    private _zoom = 1;
    private _angle = 0;
    public events = new EventEmitter<'view' | 'angle'>();
    private point = { x: 0, y: 0 };

    /**
     * The position of the PontOfView on the x axis relative to the local coordinates of the parent.
     *
     * @member {number}
     */
    public get x() {
        return this.point.x;
    }

    /**
     * The position of the PontOfView on the x axis relative to the local coordinates of the parent.
     *
     * @member {number}
     */
    public get y() {
        return this.point.y;
    }

    /**
     * the pixel / meter ratio
     */
    public get angle() {
        return this._angle;
    }

    /**
     * the pixel / meter ratio
     */
    public get zoom() {
        return this._zoom;
    }

    /**
     * the meter / pixel ratio
     */
    public get distance() {
        return 1 / this._zoom;
    }

    /**
     * Sets the point to a new x and y position.
     */
    set(position: XY) {
        this.point = position;
        this.events.emit('view');
    }

    public setRange(radius: number, range: number) {
        this.setZoom(radius / range);
    }

    public setZoom(value: number) {
        value = Math.max(Camera.minZoom, Math.min(Camera.maxZoom, value));
        if (this._zoom !== value && !Number.isNaN(value)) {
            this._zoom = value;
            this.events.emit('view');
        }
    }

    public setAngle(value: number) {
        if (this._angle !== value && !Number.isNaN(value)) {
            this._angle = value;
            this.events.emit('angle');
        }
    }

    /**
     * change radar zoom
     */
    public changeZoom(delta: number) {
        this.setZoom(this.zoom * (1.0 + delta / 1000.0));
    }

    private screenCenter(screen: { width: number; height: number }) {
        return { x: screen.width / 2, y: screen.height / 2 };
    }

    public worldToScreen(screen: { width: number; height: number }, x: number, y: number): XY {
        return XY.add(
            XY.rotate(XY.scale(XY.difference({ x, y }, this.point), this.zoom), -this.angle),
            this.screenCenter(screen)
        );
    }

    public screenToWorld(screen: Screen, x: number, y: number): XY {
        return XY.add(
            XY.scale(XY.rotate(XY.difference({ x, y }, this.screenCenter(screen)), this.angle), 1 / this.zoom),
            this.point
        );
    }

    bindZoom(container: Container, state: { zoom: number }) {
        this.setZoom(state.zoom);
        container.on('zoomOut', () => {
            this.setZoom(this.zoom * 0.9);
        });
        container.on('zoomIn', () => {
            this.setZoom(this.zoom * 1.1);
        });
    }

    bindRange(container: Container, sizeFactor: number, state: { range: number }) {
        this.setRange((sizeFactor * Math.min(container.width, container.height)) / 2, state.range);
        container.on('resize', () => {
            this.setRange((sizeFactor * Math.min(container.width, container.height)) / 2, state.range);
        });
    }

    followSpaceObject(spaceObject: SpaceObject, changeEvents: EventEmitter, angle = false) {
        changeEvents.on(spaceObject.id, (changes: DataChange[]) => {
            changes.forEach((change) => {
                if (change.field === 'position') {
                    this.set(spaceObject.position);
                } else if (angle && change.field === 'angle') {
                    this.setAngle(spaceObject.angle + 90);
                }
            });
        });
        this.set(spaceObject.position);
        if (angle) {
            this.setAngle(spaceObject.angle + 90);
        }
    }
}
