import { NotPermittedError, StationSession } from './session';
import { StationCommand, StationEntry, StationsManifest } from '@starwards/core/internal';

/**
 * Seats one player (or one brain) at several stations at once, under one name. A multiplexed seat
 * reads the union of its members' widgets and works the union of their commands; nothing a member
 * cannot see is added, so its fog of war is exactly the members' together.
 */
export const multiplexedStations: Record<string, readonly string[]> = {
    tactical: ['helms', 'weapons'],
};

function multiplexedEntry(manifest: StationsManifest, members: readonly string[]): StationEntry | undefined {
    const entries = members.map((m) => manifest.stations[m]);
    if (entries.some((e) => !e || e.gm)) {
        return undefined;
    }
    return {
        enabled: entries.every((e) => e.enabled),
        widgets: [...new Set(entries.flatMap((e) => e.widgets ?? []))],
        commands: [...new Set(entries.flatMap((e) => e.commands ?? []))],
        prompt: `You hold the ${members.join(' and ')} seats together. ${entries.map((e) => e.prompt ?? '').join(' ')}`.trim(),
    };
}

/** The manifest with every multiplexed station whose members it has. */
export function withMultiplexedStations(manifest: StationsManifest): StationsManifest {
    const stations = { ...manifest.stations };
    for (const [name, members] of Object.entries(multiplexedStations)) {
        const entry = multiplexedEntry(manifest, members);
        if (entry && !(name in stations)) {
            stations[name] = entry;
        }
    }
    return { ...manifest, stations };
}

/** A seat made of member seats: reads through its union entry, and each command goes to the member that holds it. */
export class MultiplexedSession extends StationSession {
    constructor(
        stationName: string,
        entry: StationEntry,
        readonly members: readonly StationSession[],
    ) {
        super(stationName, entry, members[0].shipDriver, members[0].spaceDriver, { radar: members[0].radar });
    }

    /** The member station that holds this command; undefined when none does. */
    seatOf(command: StationCommand): string | undefined {
        return this.members.find((m) => m.commands.includes(command))?.stationName;
    }

    override async execute(...[command, args, value]: Parameters<StationSession['execute']>): Promise<string> {
        const member = this.members.find((m) => m.commands.includes(command));
        if (!member) {
            throw new NotPermittedError(
                `station "${this.stationName}" cannot ${command}. It can: ${this.commands.join(', ')}`,
            );
        }
        return member.execute(command, args, value);
    }
}

/**
 * Opens a seat by name: a manifest station through `open`, or a multiplexed one by opening each of
 * its members through `open`. Refuses a station the manifest lacks or has closed.
 */
export function openStation(
    manifest: StationsManifest,
    station: string,
    open: (station: string, entry: StationEntry) => StationSession,
): StationSession {
    const entry = manifest.stations[station] ?? withMultiplexedStations(manifest).stations[station];
    if (!entry) {
        throw new NotPermittedError(
            `there is no station "${station}". There are: ${Object.keys(withMultiplexedStations(manifest).stations).join(', ')}`,
        );
    }
    const members = multiplexedStations[station];
    if (!members) {
        if (!entry.enabled) {
            throw new NotPermittedError(`station "${station}" is not open on this ship`);
        }
        return open(station, entry);
    }
    return new MultiplexedSession(
        station,
        multiplexedEntry(manifest, members)!,
        members.map((m) => openStation(manifest, m, open)),
    );
}

/** The real stations a seat occupies: its members when multiplexed, else itself. */
export function seatsOf(station: string): readonly string[] {
    return multiplexedStations[station] ?? [station];
}
