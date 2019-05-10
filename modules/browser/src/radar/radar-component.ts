import { Radar } from './radar';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { Container } from 'golden-layout';
import { Client } from 'colyseus.js';
import { SpaceState } from '@starwards/model';
import { getRoom } from '../client';

WebFont.load({
  custom: {
    families: ['Bebas']
  }
});

PIXI.Loader.shared.add('images/RadarBlip.png');

const room = getRoom<SpaceState>('space');

export function radarComponent( container: Container ) {
  PIXI.Loader.shared.load(() => {
    const radar = new Radar(container.width, container.height, room);
    container.on('resize', () => {
      radar.resizeWindow(container.width, container.height);
    });
    container.getElement().bind('wheel', e => {
      e.stopPropagation();
      e.preventDefault();
      radar.changeZoom(-(e.originalEvent as WheelEvent).deltaY);
    });

    container.getElement().append(radar.view);
  });
  }
