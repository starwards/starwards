import { HackLevel, ShipState, SystemState } from '@starwards/core/internal';

/**
 * Detects player-ship systems that transitioned to broken, or were hacked offline, and reports each one, once.
 * A ship's first sighting only records a baseline, so systems already broken on arrival
 * (loaded games, converted ships) are never announced.
 */
export class SystemBrokenAnnouncer {
    private readonly wasBroken = new Map<string, Map<SystemState, boolean>>();
    private readonly wasHacked = new Map<string, Map<SystemState, boolean>>();

    /** Call once per tick per ship. Returns one message per system that broke since the previous call. */
    check(shipId: string, state: ShipState): string[] {
        if (!state.isPlayerShip) {
            this.forget(shipId);
            return [];
        }
        const previous = this.wasBroken.get(shipId);
        const previousHacked = this.wasHacked.get(shipId);
        const current = new Map<SystemState, boolean>();
        const currentHacked = new Map<SystemState, boolean>();
        const messages: string[] = [];
        for (const system of state.systems()) {
            const broken = system.broken;
            current.set(system, broken);
            if (previous && broken && previous.get(system) === false) {
                messages.push(`System broken: ${shipId} ${system.name}`);
            }
            const hacked = system.hackedSecondsLeft > 0 && system.hacked === HackLevel.DISABLED;
            currentHacked.set(system, hacked);
            if (previousHacked && hacked && previousHacked.get(system) === false) {
                messages.push(`System hacked: ${shipId} ${system.name}`);
            }
        }
        this.wasBroken.set(shipId, current);
        this.wasHacked.set(shipId, currentHacked);
        return messages;
    }

    forget(shipId: string) {
        this.wasBroken.delete(shipId);
        this.wasHacked.delete(shipId);
    }
}
