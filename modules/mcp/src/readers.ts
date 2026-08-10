import { JobStatus, RepairOperationStatus, StationWidget, System, ammoTypes } from '@starwards/core/internal';

import { StationSession } from './sandbox/session';
import { describeContact } from './contacts';

/**
 * What each widget shows, as data.
 *
 * A station screen draws these panels; a headless station reads them. The split matters for the same
 * reason it matters on the bridge: the seat that can see the repair queue is a different seat from
 * the one that can see the tubes, and a crew that shares a picture too freely stops talking to each
 * other. So a reader runs only when the seat holds the widget — `requireWidget` upstream — and each
 * reader stays inside what its panel actually displays.
 */

function isPilotSystem(pointer: string): boolean {
    return (
        pointer.startsWith('/thrusters/') ||
        pointer === '/warp' ||
        pointer.startsWith('/radars/') ||
        pointer === '/maneuvering' ||
        pointer === '/smartPilot'
    );
}

function isWeaponsSystem(pointer: string): boolean {
    return (
        pointer.startsWith('/tubes/') ||
        pointer.startsWith('/chainGuns/') ||
        pointer === '/magazine' ||
        pointer.startsWith('/radars/')
    );
}

function describeSystem(system: System) {
    return {
        pointer: system.pointer,
        name: system.state.name,
        status: system.getStatus(),
        heatStatus: system.getHeatStatus(),
        power: system.state.power,
        coolantFactor: system.state.coolantFactor,
        heat: system.state.heat,
        energyPerMinute: system.state.energyPerMinute,
        broken: system.state.broken,
        effectiveness: system.state.effectiveness,
    };
}

/**
 * The systems a station's own status panel lists. Pilot and weapons each see their own subset; every
 * other seat holding this widget sees the systems it was given, which for the engineer is all of them
 * through `full-systems-status`.
 */
function stationSystems(session: StationSession): System[] {
    const systems = session.shipDriver.systems;
    if (session.stationName === 'pilot') {
        return systems.filter((s) => isPilotSystem(s.pointer));
    }
    if (session.stationName === 'weapons') {
        return systems.filter((s) => isWeaponsSystem(s.pointer));
    }
    if (session.widgets.includes('signals-jobs')) {
        return systems.filter((s) => s.pointer.startsWith('/radars/'));
    }
    return systems;
}

type WidgetReader = (session: StationSession) => unknown;

export const widgetReaders: Partial<Record<StationWidget, WidgetReader>> = {
    'pilot-stats': (s) => {
        const ship = s.shipDriver.state;
        return {
            energy: ship.reactor?.energy,
            afterBurnerFuel: ship.maneuvering?.afterBurnerFuel,
            heading: ship.spaceship?.angle,
            speed: ship.speed,
            turnSpeed: ship.spaceship?.turnSpeed,
            rotationCommand: ship.smartPilot?.rotation,
            rotation: ship.rotation,
            maneuveringCommand: { x: ship.smartPilot?.maneuvering?.x, y: ship.smartPilot?.maneuvering?.y },
            strafe: ship.strafe,
            boost: ship.boost,
            afterBurner: ship.afterBurnerCommand,
            antiDrift: ship.antiDrift,
            breaks: ship.breaks,
            rotationMode: ship.smartPilot?.rotationMode,
            maneuveringMode: ship.smartPilot?.maneuveringMode,
        };
    },

    'systems-status': (s) => stationSystems(s).map(describeSystem),

    'full-systems-status': (s) => s.shipDriver.systems.map(describeSystem),

    'engineering-status': (s) => {
        const ship = s.shipDriver.state;
        return {
            energy: ship.reactor?.energy,
            afterBurnerFuel: ship.maneuvering?.afterBurnerFuel,
            hullDamaged: ship.hullDamaged,
        };
    },

    'warp-status': (s) => {
        const warp = s.shipDriver.state.warp;
        if (!warp) {
            return { fitted: false };
        }
        return {
            fitted: true,
            currentLevel: warp.currentLevel,
            desiredLevel: warp.desiredLevel,
            jammed: warp.jammed,
            currentFrequency: warp.currentFrequency,
            standbyFrequency: warp.standbyFrequency,
            frequencyChange: warp.frequencyChange,
        };
    },

    'docking-status': (s) => {
        const docking = s.shipDriver.state.docking;
        return { mode: docking?.mode, targetId: docking?.targetId };
    },

    'armor-status': (s) => {
        const armor = s.shipDriver.state.armor;
        return {
            numberOfPlates: armor?.numberOfPlates,
            healthyPlates: armor?.numberOfHealthyPlates,
        };
    },

    'damage-report': (s) =>
        s.shipDriver.systems.flatMap((system) =>
            system.defectibles
                .filter((d) => (system.state[d.field as keyof typeof system.state] as unknown as number) !== d.normal)
                .map((d) => ({
                    system: system.pointer,
                    field: d.field,
                    value: system.state[d.field as keyof typeof system.state] as unknown as number,
                    normal: d.normal,
                })),
        ),

    'repair-queue': (s) => {
        const queue = s.shipDriver.state.repairQueue;
        return {
            refusalReason: queue?.refusalReason,
            operations: [...(queue?.operations ?? [])].map((op) => ({
                id: op.id,
                protocolId: op.protocolId,
                status: RepairOperationStatus[op.status],
                progress: op.progress,
            })),
            recentlyFinished: [...(queue?.recentlyFinished ?? [])].map((op) => ({
                id: op.id,
                protocolId: op.protocolId,
                status: RepairOperationStatus[op.status],
            })),
        };
    },

    'tubes-status': (s) =>
        [...s.shipDriver.state.tubes].map((tube, index) => ({
            index,
            projectile: tube.projectile,
            loadedProjectile: tube.loadedProjectile,
            loading: tube.loading,
            loadAmmo: tube.loadAmmo,
            isFiring: tube.isFiring,
        })),

    'gun-status': (s) =>
        [...s.shipDriver.state.chainGuns].map((gun, index) => ({
            index,
            projectile: gun.projectile,
            loadedProjectile: gun.loadedProjectile,
            loading: gun.loading,
            loadAmmo: gun.loadAmmo,
            isFiring: gun.isFiring,
            shellRange: gun.shellRange,
            shellSecondsToLive: gun.shellSecondsToLive,
        })),

    'ammo-status': (s) => {
        const magazine = s.shipDriver.state.magazine;
        if (!magazine) {
            return { fitted: false };
        }
        const counts: Record<string, { count: number; max: number }> = {};
        for (const ammo of ammoTypes) {
            counts[ammo] = {
                count: (magazine as unknown as Record<string, number>)[`count_${ammo}`],
                max: (magazine.design as unknown as Record<string, number>)[`max_${ammo}`],
            };
        }
        return { fitted: true, capacity: magazine.capacity, ammo: counts };
    },

    'targeting-status': (s) => {
        const targeting = s.shipDriver.state.weaponsTarget;
        return {
            targetId: targeting?.targetId,
            shipOnly: targeting?.shipOnly,
            enemyOnly: targeting?.enemyOnly,
            shortRangeOnly: targeting?.shortRangeOnly,
        };
    },

    /**
     * The targeting panel names the current target — so it is scan-level gated exactly like a blip:
     * an unscanned target reads as an unidentified contact, never as "the frigate you are aiming at".
     */
    'target-info': (s) => {
        const targetId = s.shipDriver.state.weaponsTarget?.targetId;
        const ownShip = s.spaceDriver.state.getShip(s.shipDriver.id);
        if (!targetId || !ownShip) {
            return { target: null };
        }
        const target = s.spaceDriver.state.get(targetId);
        if (!target || !s.radar.visibleObjects(s.viewFaction).has(target)) {
            return { target: null };
        }
        return { target: describeContact(target, s.viewFaction, ownShip.position) };
    },

    'signals-jobs': (s) => {
        const signals = s.shipDriver.state.signals;
        const ownShip = s.spaceDriver.state.getShip(s.shipDriver.id);
        const visible = s.radar.visibleObjects(s.viewFaction);
        return {
            paused: signals?.jobsPaused,
            // a job names its target, so the same fog-of-war gate applies: a job on a contact the
            // station cannot currently see reports the bare id, not what the object turns out to be
            jobs: [...(signals?.jobs ?? [])].map((job) => {
                const target = s.spaceDriver.state.get(job.targetId);
                const known = target && visible.has(target) && ownShip;
                return {
                    id: job.id,
                    status: JobStatus[job.status],
                    progress: job.progress,
                    target: known ? describeContact(target, s.viewFaction, ownShip.position) : { id: job.targetId },
                };
            }),
        };
    },

    'waypoint-groups': (s) => {
        const groups: Record<string, string[]> = {};
        for (const waypoint of s.spaceDriver.state.getAll('Waypoint')) {
            (groups[waypoint.collection] ??= []).push(waypoint.id);
        }
        return groups;
    },

    'waypoint-edit': (s) =>
        [...s.spaceDriver.state.getAll('Waypoint')].map((waypoint) => ({
            id: waypoint.id,
            title: waypoint.title,
            collection: waypoint.collection,
            color: waypoint.color,
            owner: waypoint.owner,
            position: { x: waypoint.position.x, y: waypoint.position.y },
        })),
};

/**
 * The scan beam's commanded geometry, which the long-range radar draws as wedges over its own ship.
 * It describes the station's own equipment, not what the equipment found, so it is not fog-of-war
 * gated — the operator can always see where their own beam is pointing.
 */
export function scanBeamStatus(session: StationSession) {
    const pointer = session.scanBeamPointer;
    if (!pointer) {
        return null;
    }
    const beam = session.shipDriver.systems.find((s) => s.pointer === pointer)?.state as unknown as
        { bearingCommand: number; arc: number; range: number } | undefined;
    return beam ? { pointer, bearing: beam.bearingCommand, arc: beam.arc, range: beam.range } : null;
}

/**
 * The pilot radar's reach: normally short, and a hundred times longer at warp, where the pilot is
 * flying by a far coarser picture.
 */
export function pilotRadarRange(session: StationSession): number {
    return (session.shipDriver.state.warp?.currentLevel ?? 0) > 0.5 ? 100_000 : 5_000;
}
