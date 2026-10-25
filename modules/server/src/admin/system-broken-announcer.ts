import { ShipState, SystemState } from '@starwards/core/internal';

/**
 * Detects player-ship systems that transitioned to broken and reports each one, once.
 * A ship's first sighting only records a baseline, so systems already broken on arrival
 * (loaded games, converted ships) are never announced.
 */
export class SystemBrokenAnnouncer {
    private readonly wasBroken = new Map<string, Map<SystemState, boolean>>();

    /** Call once per tick per ship. Returns one message per system that broke since the previous call. */
    check(shipId: string, state: ShipState): string[] {
        if (!state.isPlayerShip) {
            this.wasBroken.delete(shipId);
            return [];
        }
        const previous = this.wasBroken.get(shipId);
        const current = new Map<SystemState, boolean>();
        const messages: string[] = [];
        for (const system of state.systems()) {
            const broken = system.broken;
            current.set(system, broken);
            if (previous && broken && previous.get(system) === false) {
                messages.push(`System broken: ${shipId} ${system.name}`);
            }
        }
        this.wasBroken.set(shipId, current);
        return messages;
    }

    forget(shipId: string) {
        this.wasBroken.delete(shipId);
    }
}
