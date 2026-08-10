import { Application } from 'pixi.js';
import { ammoScenes } from './ammo';
import { armorScenes } from './armor';
import { engineeringStatusScenes } from './engineering-status';
import { gmRadarScenes } from './gm-radar';
import { longRangeRadarScenes } from './long-range-radar';
import { observationModeScenes } from './observation-mode';
import { pilotScenes } from './pilot';
import { tacticalRadarScenes } from './tactical-radar';
import { targetingScenes } from './targeting';
import { tubesStatusScenes } from './tubes-status';
import { warpScenes } from './warp';

export interface Scene {
    name: string;
    description: string;
    /** Setup returns Application for ticker control */
    setup: (container: HTMLElement) => Promise<Application | void> | Application | void;
    teardown?: () => void;
}

export const scenes: Record<string, Scene> = {
    ...ammoScenes,
    ...armorScenes,
    ...engineeringStatusScenes,
    ...gmRadarScenes,
    ...longRangeRadarScenes,
    ...observationModeScenes,
    ...pilotScenes,
    ...tacticalRadarScenes,
    ...targetingScenes,
    ...tubesStatusScenes,
    ...warpScenes,
};
