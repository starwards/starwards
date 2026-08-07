import { StationCommand } from '@starwards/core/internal';
import { z } from 'zod';

/**
 * How each station command reaches the game.
 *
 * One entry per flag in `stationCommands`, and the entry is the whole binding: which room it talks
 * to, what it addresses, and what arguments the caller must supply. A station screen wires these as
 * key bindings and gamepad axes; a headless client calls them by name.
 *
 * `target` kinds:
 * - `fixed`   — a constant JSON pointer on the ship.
 * - `indexed` — a pointer with an index the caller supplies (`/tubes/{index}/isFiring`), validated
 *               against how many of that thing the ship actually has.
 * - `system`  — a pointer relative to a subsystem the caller names (`{system}/power`).
 * - `beam`    — a pointer relative to the ship's scan beam, which the station locates for itself.
 * - `ship-command` / `space-command` — a typed command sent to the ship or space room.
 */
export type CommandBinding =
    | { kind: 'fixed'; pointer: string; value: ValueKind }
    | { kind: 'indexed'; collection: 'tubes' | 'chainGuns'; field: string; value: ValueKind }
    | { kind: 'system'; field: 'power' | 'coolantFactor'; value: ValueKind }
    | { kind: 'beam'; field: 'bearingCommand' | 'arc'; value: ValueKind }
    | { kind: 'ship-command'; cmdName: string; args: z.ZodTypeAny }
    | { kind: 'space-command'; cmdName: string; args: z.ZodTypeAny }
    | { kind: 'space-pointer'; type: string; fields: readonly string[]; args: z.ZodTypeAny };

/**
 * What the caller must pass as `value`.
 * - `trigger` — a momentary press. The browser sends 1 on key-down; there is nothing to read back.
 * - `toggle`  — a boolean the caller sets outright.
 * - `number`  — a number, checked against the field's declared range before it is sent.
 * - `burst`   — a momentary press held for a while: `isFiring` on, then off. See `fireBurst`.
 */
export type ValueKind = 'trigger' | 'toggle' | 'number' | 'burst';

const waypointId = z.object({ id: z.string().describe('waypoint id') });

export const commandBindings: Record<StationCommand, CommandBinding> = {
    // --- pilot ---
    rotation: { kind: 'fixed', pointer: '/smartPilot/rotation', value: 'number' },
    strafe: { kind: 'fixed', pointer: '/smartPilot/maneuvering/y', value: 'number' },
    boost: { kind: 'fixed', pointer: '/smartPilot/maneuvering/x', value: 'number' },
    resetRotationOffset: { kind: 'fixed', pointer: '/smartPilot/rotationTargetOffset', value: 'number' },
    rotationMode: { kind: 'fixed', pointer: '/rotationModeCommand', value: 'trigger' },
    maneuveringMode: { kind: 'fixed', pointer: '/maneuveringModeCommand', value: 'trigger' },
    afterBurner: { kind: 'fixed', pointer: '/afterBurnerCommand', value: 'number' },
    antiDrift: { kind: 'fixed', pointer: '/antiDrift', value: 'number' },
    breaks: { kind: 'fixed', pointer: '/breaks', value: 'number' },
    warpUp: { kind: 'fixed', pointer: '/warp/levelUpCommand', value: 'trigger' },
    warpDown: { kind: 'fixed', pointer: '/warp/levelDownCommand', value: 'trigger' },
    dock: { kind: 'fixed', pointer: '/docking/toggleCommand', value: 'trigger' },

    // --- weapons ---
    nextTarget: { kind: 'fixed', pointer: '/weaponsTarget/nextTargetCommand', value: 'trigger' },
    prevTarget: { kind: 'fixed', pointer: '/weaponsTarget/prevTargetCommand', value: 'trigger' },
    clearTarget: { kind: 'fixed', pointer: '/weaponsTarget/clearTargetCommand', value: 'trigger' },
    targetShipsOnly: { kind: 'fixed', pointer: '/weaponsTarget/shipOnly', value: 'toggle' },
    targetEnemyOnly: { kind: 'fixed', pointer: '/weaponsTarget/enemyOnly', value: 'toggle' },
    targetShortRangeOnly: { kind: 'fixed', pointer: '/weaponsTarget/shortRangeOnly', value: 'toggle' },
    fireTube: { kind: 'indexed', collection: 'tubes', field: 'isFiring', value: 'burst' },
    loadTube: { kind: 'indexed', collection: 'tubes', field: 'loadAmmo', value: 'toggle' },
    changeTubeAmmo: { kind: 'indexed', collection: 'tubes', field: 'changeProjectileCommand', value: 'trigger' },
    fireChainGun: { kind: 'indexed', collection: 'chainGuns', field: 'isFiring', value: 'burst' },
    loadChainGun: { kind: 'indexed', collection: 'chainGuns', field: 'loadAmmo', value: 'toggle' },
    changeGunAmmo: { kind: 'indexed', collection: 'chainGuns', field: 'changeProjectileCommand', value: 'trigger' },

    // --- engineering ---
    systemPower: { kind: 'system', field: 'power', value: 'number' },
    systemCoolant: { kind: 'system', field: 'coolantFactor', value: 'number' },
    ecrControl: { kind: 'fixed', pointer: '/ecrControl', value: 'toggle' },
    warpFrequency: { kind: 'fixed', pointer: '/warp/standbyFrequency', value: 'number' },
    changeFrequency: { kind: 'fixed', pointer: '/warp/changeFrequencyCommand', value: 'trigger' },
    enqueueRepair: {
        kind: 'ship-command',
        cmdName: 'enqueueRepair',
        args: z.object({ protocolId: z.string().describe('repair protocol id, from the repair-queue status') }),
    },
    cancelRepair: {
        kind: 'ship-command',
        cmdName: 'cancelRepair',
        args: z.object({ operationId: z.string().describe('id of the queued operation') }),
    },
    reorderRepair: {
        kind: 'ship-command',
        cmdName: 'reorderRepair',
        args: z.object({
            operationId: z.string().describe('id of the queued operation'),
            index: z.number().int().min(0).describe('position to move it to'),
        }),
    },

    // --- signals ---
    beamDirection: { kind: 'beam', field: 'bearingCommand', value: 'number' },
    beamArc: { kind: 'beam', field: 'arc', value: 'number' },
    pauseJobs: { kind: 'fixed', pointer: '/signals/jobsPaused', value: 'toggle' },
    prioritizeJob: { kind: 'fixed', pointer: '/signals/prioritizeJobId', value: 'trigger' },
    cancelJob: { kind: 'fixed', pointer: '/signals/cancelJobId', value: 'trigger' },

    // --- relay ---
    placeWaypoint: {
        kind: 'space-command',
        cmdName: 'createWaypointOrder',
        args: z.object({
            position: z.object({ x: z.number(), y: z.number() }),
            title: z.string().optional(),
            collection: z.string().optional(),
        }),
    },
    // the waypoint-edit panel writes these straight onto the waypoint in the space room
    editWaypoint: {
        kind: 'space-pointer',
        type: 'Waypoint',
        fields: ['title', 'collection', 'color'],
        args: waypointId.extend({
            title: z.string().optional(),
            collection: z.string().optional(),
            color: z.number().optional(),
        }),
    },
    moveWaypoint: {
        kind: 'space-command',
        cmdName: 'bulkMove',
        args: waypointId.extend({ delta: z.object({ x: z.number(), y: z.number() }) }),
    },
    deleteWaypoint: { kind: 'space-command', cmdName: 'bulkDeleteOrder', args: waypointId },
};
