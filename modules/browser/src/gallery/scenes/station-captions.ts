import EventEmitter from 'eventemitter3';
import { Scene } from './index';
import { createMockContainer } from '../mocks/container';
import { drawMapCaption } from '../../widgets/map-caption';
import { drawRadarHeader } from '../../widgets/radar-header';

export const stationCaptionScenes: Record<string, Scene> = {
    'radar-header': {
        name: 'radar-header',
        description: "Caption strip above a station's radar: what it shows, whose it is",
        setup(container: HTMLElement) {
            drawRadarHeader(createMockContainer(container, 500, 40), 'ENGINEERING', 'SHIP player');
        },
    },
    'map-caption': {
        name: 'map-caption',
        description: "Dradis map caption: grid cell size at the current zoom and the ship's id",
        setup(container: HTMLElement) {
            const view = { events: new EventEmitter() };
            drawMapCaption(createMockContainer(container, 400, 40), view as never, () => 2500, 'player');
        },
    },
};
