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
    private static readonly minZoom = 0.00005;
    private static readonly maxZoom = 1;
    private _zoom = 1;
    public events = new EventEmitter();
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
    public get zoom() {
        return this._zoom;
    }

    /**
     * Sets the point to a new x and y position.
     */
    set(position: XY) {
        this.point = position;
        this.events.emit('change');
    }

    public setZoom(value: number) {
        value = Math.max(Camera.minZoom, Math.min(Camera.maxZoom, value));
        if (this._zoom !== value && !Number.isNaN(value)) {
            this._zoom = value;
            this.events.emit('change');
        }
    }

    /**
     * change radar zoom
     */
    public changeZoom(delta: number) {
        this.setZoom(this.zoom * (1.0 + delta / 1000.0));
    }

    public worldToScreen(screen: { width: number; height: number }, x: number, y: number): XY {
        return {
            x: (x - this.x) * this.zoom + screen.width / 2,
            y: (y - this.y) * this.zoom + screen.height / 2,
        };
    }

    public screenToWorld(screen: Screen, x: number, y: number): XY {
        return {
            x: this.x + (x - screen.width / 2) / this.zoom,
            y: this.y + (y - screen.height / 2) / this.zoom,
        };
    }

    bindZoom(container: Container, state: { zoom: number }) {
        this.setZoom(state.zoom);
        container.on('zoomOut', () => {
            this.setZoom(this.zoom * 0.9);
        });
        container.on('zoomIn', () => {
            this.setZoom(this.zoom * 1.1);
        });
        this.events.on('zoomChanged', () => {
            state.zoom = this.zoom;
        });
        container.getElement().bind('wheel', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
        });
    }

    followSpaceObject(spaceObject: SpaceObject, changeEvents: EventEmitter) {
        changeEvents.on(spaceObject.id, (changes: DataChange[]) => {
            changes.forEach((change) => {
                if (change.field === 'position') {
                    this.set(spaceObject.position);
                }
            });
        });
        this.set(spaceObject.position);
    }
}
