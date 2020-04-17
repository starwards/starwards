import * as PIXI from 'pixi.js';
import { XY } from '@starwards/model';
import EventEmitter from 'eventemitter3';
import { Container } from 'golden-layout';

function bindPointOfViewToContainer(pov: PontOfView, container: Container, state: { zoom: number }) {
    pov.setZoom(state.zoom);
    container.on('zoomOut', () => {
        pov.setZoom(pov.zoom * 0.9);
    });
    container.on('zoomIn', () => {
        pov.setZoom(pov.zoom * 1.1);
    });
    pov.events.on('zoomChanged', () => {
        state.zoom = pov.zoom;
    });
    container.getElement().bind('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        pov.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
    });
}

export interface Screen {
    width: number;
    height: number;
}
export class PontOfView {
    private static readonly minZoom = 0.00005;
    private static readonly maxZoom = 1;

    public static makeBoundPointOfView(container: Container, state: { zoom: number }) {
        const pov = new PontOfView();
        bindPointOfViewToContainer(pov, container, state);
        return pov;
    }

    private _zoom = 1;
    public events = new EventEmitter();
    private cb = () => this.events.emit('change');
    public point = new PIXI.ObservablePoint(this.cb, null);

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
    set(x: number, y: number) {
        this.point.set(x, y);
    }

    public setZoom(value: number) {
        value = Math.max(PontOfView.minZoom, Math.min(PontOfView.maxZoom, value));
        if (this._zoom !== value && !Number.isNaN(value)) {
            this._zoom = value;
            this.cb();
        }
    }

    /**
     * change radar zoom
     */
    public changeZoom(delta: number) {
        this.setZoom(this.zoom * (1.0 + delta / 1000.0));
    }

    public worldToScreen(screen: Screen, x: number, y: number): XY {
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
}
