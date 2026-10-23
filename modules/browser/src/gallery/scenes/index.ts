import { Application } from 'pixi.js';
import { ammoScenes } from './ammo';
import { armorScenes } from './armor';
import { damageReportScenes } from './damage-report';
import { dockingScenes } from './docking';
import { dradisRadarScenes } from './dradis-radar';
import { engineeringStatusScenes } from './engineering-status';
import { gmRadarScenes } from './gm-radar';
import { gunScenes } from './gun';
import { helmsScenes } from './helms';
import { longRangeRadarScenes } from './long-range-radar';
import { missilePaintScenes } from './missile-paint';
import { observationModeScenes } from './observation-mode';
import { repairQueueScenes } from './repair-queue';
import { scanBeamScenes } from './scan-beam';
import { signalsJobsScenes } from './signals-jobs';
import { smartGunScenes } from './smart-gun';
import { stationCaptionScenes } from './station-captions';
import { stationRosterScenes } from './station-roster';
import { systemsStatusScenes } from './systems-status';
import { tacticalRadarScenes } from './tactical-radar';
import { targetInfoScenes } from './target-info';
import { targetTubesScenes } from './target-tubes';
import { targetingScenes } from './targeting';
import { tubesStatusScenes } from './tubes-status';
import { warpScenes } from './warp';
import { waypointScenes } from './waypoints';

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
    ...smartGunScenes,
    ...stationRosterScenes,
    ...tacticalRadarScenes,
    ...targetingScenes,
    ...tubesStatusScenes,
    ...warpScenes,
    ...damageReportScenes,
    ...dockingScenes,
    ...gunScenes,
    ...scanBeamScenes,
    ...signalsJobsScenes,
    ...stationCaptionScenes,
    ...systemsStatusScenes,
    ...targetInfoScenes,
    ...targetTubesScenes,
    ...waypointScenes,
};
