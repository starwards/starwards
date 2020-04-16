import { Radar } from './radar';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { Container } from 'golden-layout';
import { getRoom } from '../../client';
import { preloadList } from './blip-renderer';
import $ from 'jquery';
import { DashboardWidget } from '../dashboard';

WebFont.load({
    custom: {
        families: ['Bebas'],
    },
});

PIXI.Loader.shared.add(preloadList);

export function radarComponent(container: Container, state: { zoom: number }) {
    PIXI.Loader.shared.load(() => {
        const radar = new Radar(container.width, container.height, getRoom('space'));
        radar.setZoom(state.zoom);
        container.on('resize', () => {
            radar.resizeWindow(container.width, container.height);
        });
        container.on('zoomOut', () => {
            radar.setZoom(radar.pov.zoom * 0.9);
        });
        container.on('zoomIn', () => {
            radar.setZoom(radar.pov.zoom * 1.1);
        });
        radar.events.on('zoomChanged', () => {
            state.zoom = radar.pov.zoom;
        });
        container.getElement().bind('wheel', (e) => {
            e.stopPropagation();
            e.preventDefault();
            radar.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
        });

        container.getElement().append(radar.view);
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
