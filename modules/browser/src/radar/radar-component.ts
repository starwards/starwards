import { Radar } from './radar';
import * as PIXI from 'pixi.js';
import WebFont from 'webfontloader';
import { Container } from 'golden-layout';
import { Client, Room} from 'colyseus.js';
import { SpaceState } from '@starwards/model';

WebFont.load({
  custom: {
    families: ['Bebas']
  }
});

PIXI.Loader.shared.add('images/RadarBlip.png');

let room: Room<SpaceState> | null = null;

export function radarComponent( container: Container, state: RadarProps ) {
  PIXI.Loader.shared.load(() => {
    if (!room) {
      room = state.client.join<SpaceState>('space');
    }
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

export interface RadarProps {
  client: Client;
}
