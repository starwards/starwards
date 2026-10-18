import { StationCommand } from '@starwards/core/internal';

/**
 * How a station's buttons are pressed, one entry per station command.
 *
 * A brain never sets a value outright: like a player at the console it picks, for each control,
 * one of the buttons that control physically offers. The kinds mirror the browser's input wiring
 * (`modules/browser/src/input/input-config.ts`):
 * - `axis`      — a stepped range with a key each way (strafe: A/D), optionally a centre chord.
 * - `held`      — a key held down for as long as it should act (afterburner, anti-drift, breaks).
 * - `press`     — a momentary key with nothing to hold (mode cycles, dock).
 * - `group`     — mutually exclusive momentary keys answered as one choice (next / previous / clear target).
 * - `switch`    — a toggle whose position the display shows (target filters, magazine loading).
 * - `burst`     — a trigger pulled for one decision interval (chain gun).
 * - `protocol`  — a per-repair-protocol pair of keys.
 * - `job`       — a per-signals-job key (prioritize, cancel) that sends that job's id.
 * - `excluded`  — not offered to a brain; the reason says why.
 */
export type ControlDesign =
    | {
          kind: 'axis';
          /** Option names for one step up and one step down, e.g. `right` / `left`. */
          up: string;
          down: string;
          step: number;
          min: number;
          max: number;
          /** Value of the centre chord; absent when the console has none. */
          centre?: number;
          /** Where the display shows the current value, per expanded control. */
          read: ValueSource;
          expand: 'single' | 'system' | 'gun';
      }
    | { kind: 'held'; read: ValueSource }
    | { kind: 'press'; value: true | number; expand: 'single' | 'gun' }
    | { kind: 'group'; group: string; option: string }
    | { kind: 'switch'; read: ValueSource; expand: 'single' | 'gun' }
    | { kind: 'burst'; expand: 'gun' }
    | { kind: 'protocol'; options: Record<string, Record<string, unknown>> }
    | { kind: 'job'; verb: string }
    | { kind: 'excluded'; reason: string };

/** A path into the display, with `{system}` / `{gun}` filled in when the control is expanded. */
export type ValueSource =
    | { panel: string; path: readonly string[] }
    | { panel: string; listKey: 'pointer' | 'index'; path: readonly string[] }
    | { radar: readonly string[] };

const helmsStat = (...path: string[]) => ({ panel: 'helms-stats', path });

export const controlCatalogue = {
    // helms
    rotation: {
        kind: 'axis',
        up: 'right',
        down: 'left',
        step: 0.05,
        min: -1,
        max: 1,
        centre: 0,
        read: helmsStat('rotationCommand'),
        expand: 'single',
    },
    strafe: {
        kind: 'axis',
        up: 'right',
        down: 'left',
        step: 0.05,
        min: -1,
        max: 1,
        centre: 0,
        read: helmsStat('maneuveringCommand', 'y'),
        expand: 'single',
    },
    boost: {
        kind: 'axis',
        up: 'forward',
        down: 'back',
        step: 0.05,
        min: -1,
        max: 1,
        centre: 0,
        read: helmsStat('maneuveringCommand', 'x'),
        expand: 'single',
    },
    resetRotationOffset: { kind: 'press', value: 0, expand: 'single' },
    rotationMode: { kind: 'press', value: true, expand: 'single' },
    maneuveringMode: { kind: 'press', value: true, expand: 'single' },
    afterBurner: { kind: 'held', read: helmsStat('afterBurner') },
    antiDrift: { kind: 'held', read: helmsStat('antiDrift') },
    breaks: { kind: 'held', read: helmsStat('breaks') },
    warpUp: { kind: 'group', group: 'warp', option: 'up' },
    warpDown: { kind: 'group', group: 'warp', option: 'down' },
    dock: { kind: 'press', value: true, expand: 'single' },

    // weapons
    nextTarget: { kind: 'group', group: 'target', option: 'next' },
    prevTarget: { kind: 'group', group: 'target', option: 'previous' },
    clearTarget: { kind: 'group', group: 'target', option: 'clear' },
    targetShipsOnly: { kind: 'switch', read: { panel: 'targeting-status', path: ['shipOnly'] }, expand: 'single' },
    targetEnemyOnly: { kind: 'switch', read: { panel: 'targeting-status', path: ['enemyOnly'] }, expand: 'single' },
    targetShortRangeOnly: {
        kind: 'switch',
        read: { panel: 'targeting-status', path: ['shortRangeOnly'] },
        expand: 'single',
    },
    fireTube: { kind: 'burst', expand: 'gun' },
    loadTube: { kind: 'switch', read: { panel: 'tubes-status', listKey: 'index', path: ['loadAmmo'] }, expand: 'gun' },
    changeTubeAmmo: { kind: 'press', value: true, expand: 'gun' },
    // on = locked: a tube fires only with its safety off, and locks again as it fires on the ship-level trigger
    tubeSafety: {
        kind: 'switch',
        read: { panel: 'tubes-status', listKey: 'index', path: ['safetyLocked'] },
        expand: 'gun',
    },
    fireChainGun: { kind: 'burst', expand: 'gun' },
    loadChainGun: {
        kind: 'switch',
        read: { panel: 'gun-status', listKey: 'index', path: ['loadAmmo'] },
        expand: 'gun',
    },
    changeGunAmmo: { kind: 'press', value: true, expand: 'gun' },

    // engineering
    systemPower: {
        kind: 'axis',
        up: 'raise',
        down: 'lower',
        step: 0.25,
        min: 0,
        max: 1,
        read: { panel: 'full-systems-status', listKey: 'pointer', path: ['power'] },
        expand: 'system',
    },
    systemCoolant: {
        kind: 'axis',
        up: 'raise',
        down: 'lower',
        step: 0.1,
        min: 0,
        max: 1,
        read: { panel: 'full-systems-status', listKey: 'pointer', path: ['coolantFactor'] },
        expand: 'system',
    },
    warpFrequency: {
        kind: 'axis',
        up: 'up',
        down: 'down',
        step: 1,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        read: { panel: 'warp-status', path: ['standbyFrequency'] },
        expand: 'single',
    },
    changeFrequency: { kind: 'press', value: true, expand: 'single' },
    cycleRepairPriority: { kind: 'protocol', options: { raise: { direction: 'up' }, lower: { direction: 'down' } } },
    toggleRepairProtocolMode: { kind: 'protocol', options: { switch_mode: {} } },

    // signals
    beamDirection: {
        kind: 'axis',
        up: 'right',
        down: 'left',
        step: 5,
        min: -180,
        max: 180,
        centre: 0,
        read: { radar: ['scanBeam', 'bearing'] },
        expand: 'single',
    },
    beamArc: {
        kind: 'axis',
        up: 'widen',
        down: 'narrow',
        step: 5,
        min: 0,
        max: 360,
        read: { radar: ['scanBeam', 'arc'] },
        expand: 'single',
    },
    pauseJobs: { kind: 'switch', read: { panel: 'signals-jobs', path: ['paused'] }, expand: 'single' },
    prioritizeJob: { kind: 'job', verb: 'move this scan job to the front of the queue' },
    cancelJob: { kind: 'job', verb: 'cancel this scan job' },

    // dradis
    placeWaypoint: { kind: 'excluded', reason: 'waypoint commands take free-form positions, not button presses' },
    editWaypoint: { kind: 'excluded', reason: 'waypoint commands take free-form positions, not button presses' },
    moveWaypoint: { kind: 'excluded', reason: 'waypoint commands take free-form positions, not button presses' },
    deleteWaypoint: { kind: 'excluded', reason: 'waypoint commands take free-form positions, not button presses' },
} as const satisfies Record<StationCommand, ControlDesign>;
