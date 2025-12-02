import { Application } from 'pixi.js';

export interface Scene {
    name: string;
    description: string;
    /** Setup returns Application for ticker control */
    setup: (container: HTMLElement) => Promise<Application | void> | Application | void;
    teardown?: () => void;
}

import { armorScenes } from './armor';
import { gmRadarScenes } from './gm-radar';
import { tacticalRadarScenes } from './tactical-radar';
export const scenes: Record<string, Scene> = {
    ...tacticalRadarScenes,
    ...armorScenes,
    ...gmRadarScenes,
};

export const sceneNames = Object.keys(scenes);
