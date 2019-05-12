import { Radar } from './radar';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { Container, ContentItem, Tab } from 'golden-layout';
import { getRoom } from '../client';
import { preloadList } from './draw-entity';
import { Registrar } from '..';
import $ from 'jquery';

WebFont.load({
  custom: {
    families: ['Bebas']
  }
});

PIXI.Loader.shared.add(preloadList);

const room = getRoom('space');

function radarComponent(container: Container, state: { zoom: number }) {
  PIXI.Loader.shared.load(() => {
    const radar = new Radar(container.width, container.height, room);
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
    container.getElement().bind('wheel', e => {
      e.stopPropagation();
      e.preventDefault();
      radar.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
    });

    container.getElement().append(radar.view);
  });
}

function setRadarHeaders(stack: ContentItem & Tab, contentItem: ContentItem) {
  const zoomIn = $(
    '<li class="custom_controls"><i class="lm_controls tiny material-icons">zoom_in</i></li>'
  );
  const zoomOut = $(
    '<li class="custom_controls"><i class="lm_controls tiny material-icons">zoom_out</i></li>'
  );
  stack.header.controlsContainer.prepend(zoomIn, zoomOut);
  zoomIn.mousedown(() => {
    const zoomInterval = setInterval(() => {
      contentItem.container.emit('zoomIn');
    }, 100);
    $(document).mouseup(() => clearInterval(zoomInterval));
  });
  zoomOut.mousedown(() => {
    const zoomInterval = setInterval(() => {
      contentItem.container.emit('zoomOut');
    }, 100);
    $(document).mouseup(() => clearInterval(zoomInterval));
  });
}

export function loadRadarComponent(registerComponent: Registrar) {
  registerComponent('radar', radarComponent, { zoom: 1 }, setRadarHeaders);
}
