import EventEmitter from 'eventemitter3';
import { PontOfView } from './point-of-view';
import * as PIXI from 'pixi.js';
import { Container } from 'golden-layout';

// extract options argument from application constructor
type AppOptions = typeof PIXI.Application extends new (options?: infer T) => PIXI.Application ? T : never;

export class BaseContainer extends PIXI.Application {
    public events = new EventEmitter();

    /**
     * @param pixiOptions options for the pixi application
     * @param pov a point in the world that the radar is watching, and a zoom level
     */
    constructor(pixiOptions: AppOptions, public pov: PontOfView, container: Container) {
        super(pixiOptions);
        pov.events.on('change', () => this.events.emit('screenChanged'));
        container.on('resize', () => {
            this.resizeWindow(container.width, container.height);
        });
        this.resizeWindow(container.width, container.height);
        container.getElement().append(this.view);
    }

    public resizeWindow(width: number, height: number) {
        this.renderer.resize(width, height);
        this.events.emit('screenChanged');
    }

    public addLayer() {
        const stage = new PIXI.Container();
        this.stage.addChild(stage);
        return stage;
    }
}
