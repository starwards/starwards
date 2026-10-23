import { Application } from 'pixi.js';
import { ammoScenes } from './ammo';
import { armorScenes } from './armor';
import { dradisRadarScenes } from './dradis-radar';
import { engineeringStatusScenes } from './engineering-status';
import { gmRadarScenes } from './gm-radar';
import { helmsScenes } from './helms';
import { longRangeRadarScenes } from './long-range-radar';
import { missilePaintScenes } from './missile-paint';
import { observationModeScenes } from './observation-mode';
import { repairQueueScenes } from './repair-queue';
import { signalsJobsScenes } from './signals-jobs';
import { smartGunScenes } from './smart-gun';
import { stationRosterScenes } from './station-roster';
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
    ...dradisRadarScenes,
    ...engineeringStatusScenes,
    ...gmRadarScenes,
    ...helmsScenes,
    ...longRangeRadarScenes,
    ...missilePaintScenes,
    ...observationModeScenes,
    ...repairQueueScenes,
    ...signalsJobsScenes,
    ...smartGunScenes,
    ...stationRosterScenes,
    ...tacticalRadarScenes,
    ...targetingScenes,
    ...tubesStatusScenes,
    ...warpScenes,
};
