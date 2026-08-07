import { StationsManifest, stationCommands, stationWidgets } from '@starwards/core/internal';

import { z } from 'zod';

const stationEntrySchema = z
    .object({
        enabled: z.boolean().optional(),
        gm: z.boolean().optional(),
        widgets: z.array(z.enum(stationWidgets)).optional(),
        commands: z.array(z.enum(stationCommands)).optional(),
        prompt: z.string().optional(),
    })
    .strict();

const manifestSchema = z.object({ stations: z.record(z.string(), stationEntrySchema) }).strict();

/**
 * Read a ship's stations manifest from the game server.
 *
 * The server owns the bridge layout, so a station this client does not recognise is a real error,
 * not something to shrug off: a flag we silently drop is a capability the crew believes the seat has
 * and it does not.
 */
export async function fetchStationsManifest(baseUrl: URL, shipId: string): Promise<StationsManifest> {
    const url = new URL(`/stations-manifest/${encodeURIComponent(shipId)}`, baseUrl);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `game server at ${url.href} answered ${response.status} ${response.statusText}. ` +
                `Check the --url argument points at a running Starwards server.`,
        );
    }
    const parsed = manifestSchema.safeParse(await response.json());
    if (!parsed.success) {
        throw new Error(
            `the stations manifest at ${url.href} is not one this client understands: ${parsed.error.message}. ` +
                `The server and this MCP client are probably different versions.`,
        );
    }
    return parsed.data;
}

/** The stations a crew may take, in manifest order. A station is selectable only when enabled. */
export function enabledStations(manifest: StationsManifest): string[] {
    return Object.entries(manifest.stations)
        .filter(([, entry]) => entry.enabled)
        .map(([name]) => name);
}
