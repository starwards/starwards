import { Radar } from '../../radar/radar';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { Container } from 'golden-layout';
import { getRoom } from '../../client';
import { preloadList } from './blip-renderer';
import $ from 'jquery';
import { DashboardWidget } from '../dashboard';
import { PontOfView } from '../../radar/point-of-view';
import { BaseContainer } from '../../radar/base-container';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

PIXI.Loader.shared.add(preloadList);

function radarComponent(container: Container, state: { zoom: number }) {
    const pov = PontOfView.makeBoundPointOfView(container, state);
    PIXI.Loader.shared.load(() => {
        const base = new BaseContainer(
            {
                width: container.width,
                height: container.height,
                backgroundColor: 0x0f0f0f,
            },
            pov,
            container
        );
        const radar = new Radar(base, getRoom('space'));
    });
}

export function makeRadarHeaders(container: Container): Array<JQuery<HTMLElement>> {
    const zoomIn = $('<i class="lm_controls tiny material-icons">zoom_in</i>');
    const zoomOut = $('<i class="lm_controls tiny material-icons">zoom_out</i>');
    zoomIn.mousedown(() => {
        const zoomInterval = setInterval(() => {
            container.emit('zoomIn');
        }, 100);
        $(document).mouseup(() => clearInterval(zoomInterval));
    });
    zoomOut.mousedown(() => {
        const zoomInterval = setInterval(() => {
            container.emit('zoomOut');
        }, 100);
        $(document).mouseup(() => clearInterval(zoomInterval));
    });
    return [zoomIn, zoomOut];
}

export const radarWidget: DashboardWidget<{ zoom: number }> = {
    name: 'radar',
    type: 'component',
    component: radarComponent,
    initialState: { zoom: 1 },
    makeHeaders: makeRadarHeaders,
};
