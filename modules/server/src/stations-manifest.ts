import { StationsManifest } from '@starwards/core/internal';

/**
 * The bridge as the browser client builds it: one entry per station screen, listing the widgets that
 * screen draws and the input actions it wires. Headless clients read this to scope themselves to the
 * same seat a player would occupy.
 *
 * `ecr` and `bridge-engineer` share a screen (`ecr.html?station=`) and differ only in which side of
 * `/ecrControl` holds the systems input — that gate is enforced at command time, not by these lists.
 *
 * The game master seat ships disabled: it sees all of space at full scan level and can tweak any
 * commandable field, so it is opened deliberately rather than by default.
 */
const defaultStationsManifest: StationsManifest = {
    stations: {
        pilot: {
            enabled: true,
            widgets: ['pilot-radar', 'systems-status', 'pilot-stats', 'warp-status', 'docking-status', 'armor-status'],
            commands: [
                'rotation',
                'strafe',
                'boost',
                'resetRotationOffset',
                'rotationMode',
                'maneuveringMode',
                'afterBurner',
                'antiDrift',
                'breaks',
                'warpUp',
                'warpDown',
                'dock',
            ],
            prompt: 'You fly the ship. You hold heading, speed and station-keeping, and you dock.',
        },
        weapons: {
            enabled: true,
            widgets: [
                'tactical-radar',
                'systems-status',
                'tubes-status',
                'ammo-status',
                'targeting-status',
                'gun-status',
            ],
            commands: [
                'nextTarget',
                'prevTarget',
                'clearTarget',
                'targetShipsOnly',
                'targetEnemyOnly',
                'targetShortRangeOnly',
                'fireTube',
                'loadTube',
                'changeTubeAmmo',
                'fireChainGun',
                'loadChainGun',
                'changeGunAmmo',
            ],
            prompt: 'You run the guns and tubes. You pick targets, manage ammunition, and shoot.',
        },
        ecr: {
            enabled: true,
            widgets: [
                'engineering-status',
                'warp-status',
                'full-systems-status',
                'armor-status',
                'damage-report',
                'repair-queue',
            ],
            commands: [
                'systemPower',
                'systemCoolant',
                'ecrControl',
                'warpFrequency',
                'changeFrequency',
                'enqueueRepair',
                'cancelRepair',
                'reorderRepair',
            ],
            prompt:
                'You are in the engineering control room, off the bridge. You balance power and coolant across ' +
                'systems, run damage control, and set warp frequency. Systems input is yours only while you hold ' +
                'ECR control.',
        },
        'bridge-engineer': {
            enabled: true,
            widgets: [
                'engineering-status',
                'warp-status',
                'full-systems-status',
                'armor-status',
                'damage-report',
                'repair-queue',
            ],
            commands: ['systemPower', 'systemCoolant'],
            prompt:
                'You are the engineer at the bridge console. You watch the ship and advise the captain, and you ' +
                'hold systems input only while ECR has handed it over.',
        },
        signals: {
            enabled: true,
            widgets: ['long-range-radar', 'target-info', 'systems-status', 'signals-jobs'],
            commands: ['beamDirection', 'beamArc', 'pauseJobs', 'prioritizeJob', 'cancelJob'],
            prompt:
                'You work the scan beam. You identify contacts the rest of the crew can only see as blips, and ' +
                'you say what you find out loud — nobody else has your picture.',
        },
        relay: {
            enabled: true,
            widgets: ['relay-radar', 'waypoint-groups', 'waypoint-edit'],
            commands: ['placeWaypoint', 'editWaypoint', 'moveWaypoint', 'deleteWaypoint'],
            prompt: 'You keep the navigation picture: you place, name and maintain the waypoints the crew flies by.',
        },
        gm: {
            enabled: false,
            gm: true,
            prompt: 'You are the game master. You see everything and may change anything.',
        },
    },
};

/**
 * The manifest for a ship. Every ship currently gets the same bridge; the ship is a parameter so a
 * per-model bridge (a fighter with no relay seat, a freighter with two engineers) becomes a change
 * here rather than a change to the protocol.
 */
export function getStationsManifest(_shipId: string): StationsManifest {
    return defaultStationsManifest;
}
