import {
    Driver,
    ShipDriver,
    SpaceDriver,
    StationCommand,
    StationsManifest,
    stationCommands,
    stationWidgets,
} from '@starwards/core/internal';
import { InvalidCommandError, NotPermittedError, StationSession } from './sandbox/session';
import { enabledStations, fetchStationsManifest } from './sandbox/manifest';
import { pilotRadarRange, scanBeamStatus, widgetReaders } from './readers';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { commandBindings } from './sandbox/command-map';
import { describeContact } from './contacts';
import { z } from 'zod';

const LOGIN_TIMEOUT_MS = 15_000;

/**
 * The argument bag `execute_command` accepts. Declared rather than inferred: the tool takes the union
 * of every command's arguments, and letting the compiler infer that shape through the SDK's generics
 * costs more memory than the whole rest of the build.
 */
type ExecuteCommandInput = {
    command: StationCommand;
    value?: number | boolean | string;
    index?: number;
    system?: string;
    seconds?: number;
    id?: string;
    protocolId?: string;
    operationId?: string;
    position?: { x: number; y: number };
    delta?: { x: number; y: number };
    title?: string;
    collection?: string;
    color?: number;
};

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

function ok(value: unknown): ToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string): ToolResult {
    return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Run a tool body, turning a refusal into an answer rather than a crash. A station being told "you
 * cannot do that from this seat" is a normal part of playing a station, and the message names what
 * the seat can do instead, so the caller can correct itself without guessing.
 */
async function attempt(body: () => unknown): Promise<ToolResult> {
    try {
        return ok(await body());
    } catch (e) {
        if (e instanceof NotPermittedError || e instanceof InvalidCommandError) {
            return fail(e.message);
        }
        return fail(`${(e as Error).message ?? String(e)}`);
    }
}

/**
 * The MCP surface: a bridge station, playable by an LLM.
 *
 * The shape follows what a player does. You look at the ship list, you take a seat, and from then on
 * everything you can see and everything you can do is whatever that seat has — the same boundary the
 * browser draws by only rendering one screen's widgets and only wiring one screen's keys.
 */
export function buildMcpServer(driver: Driver, baseUrl: URL) {
    const server = new McpServer(
        { name: 'starwards', version: '0.5.1' },
        {
            instructions:
                'A Starwards ship bridge. Call list_ships, then list_stations for a ship, then login to take a ' +
                'seat. From then on you are that station: get_capabilities tells you what you may read and do, ' +
                'get_radar_contacts is your scope, and execute_command is your console. What you cannot see, the ' +
                'rest of the crew may be able to — talk to them.',
        },
    );

    let session: StationSession | undefined;
    let manifest: StationsManifest | undefined;

    function requireSession(): StationSession {
        if (!session) {
            throw new NotPermittedError('you are not logged in to a station yet. Call login first.');
        }
        return session;
    }

    server.registerTool(
        'list_ships',
        {
            description: 'The ships in the running game, by id. Public lobby information.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async () =>
            attempt(async () => ({
                gameStatus: await driver.getGameStatus(),
                ships: await driver.getCurrentShipIds(),
            })),
    );

    server.registerTool(
        'list_stations',
        {
            description:
                'The stations available on a ship, with what each may see and do, and its briefing. ' +
                'Read this before choosing a seat.',
            inputSchema: { shipId: z.string().describe('ship id, from list_ships') },
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async ({ shipId }) =>
            attempt(async () => {
                manifest = await fetchStationsManifest(baseUrl, shipId);
                return enabledStations(manifest).map((name) => {
                    const entry = manifest!.stations[name];
                    return {
                        station: name,
                        gameMaster: entry.gm === true,
                        prompt: entry.prompt,
                        widgets: entry.widgets ?? [],
                        commands: entry.commands ?? [],
                    };
                });
            }),
    );

    server.registerTool(
        'login',
        {
            description:
                'Take a seat at a station on a ship. Replaces any seat you already hold. Everything you can ' +
                'see and do afterwards comes from this station.',
            inputSchema: {
                shipId: z.string().describe('ship id, from list_ships'),
                station: z.string().describe('station name, from list_stations'),
            },
            annotations: { openWorldHint: true },
        },
        async ({ shipId, station }) =>
            attempt(async () => {
                manifest = await fetchStationsManifest(baseUrl, shipId);
                const entry = manifest.stations[station];
                if (!entry) {
                    throw new NotPermittedError(
                        `ship ${shipId} has no station "${station}". It has: ${Object.keys(manifest.stations).join(', ')}`,
                    );
                }
                if (!entry.enabled) {
                    throw new NotPermittedError(`station "${station}" is not open on this ship`);
                }
                await Promise.race([
                    driver.waitForShip(shipId),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`ship ${shipId} did not appear — is the game running?`)),
                            LOGIN_TIMEOUT_MS,
                        ),
                    ),
                ]);
                const shipDriver: ShipDriver = await driver.getShipDriver(shipId);
                const spaceDriver: SpaceDriver = await driver.getSpaceDriver();
                session = new StationSession(station, entry, shipDriver, spaceDriver);
                return {
                    station,
                    shipId,
                    prompt: entry.prompt,
                    widgets: session.widgets,
                    commands: session.commands,
                };
            }),
    );

    server.registerTool('logout', { description: 'Leave your station.', inputSchema: {}, annotations: {} }, async () =>
        attempt(() => {
            session = undefined;
            return { loggedIn: false };
        }),
    );

    server.registerTool(
        'get_capabilities',
        {
            description:
                'What your seat can do right now: readable widgets, issuable commands with their arguments ' +
                'and legal value ranges, and the live counts (tubes, guns, systems) those arguments index into.',
            inputSchema: {},
            annotations: { readOnlyHint: true },
        },
        async () =>
            attempt(() => {
                const s = requireSession();
                const commands = (s.isGameMaster ? [...stationCommands] : s.commands).map((command) => {
                    const binding = commandBindings[command];
                    const base: Record<string, unknown> = { command, kind: binding.kind };
                    if (binding.kind === 'fixed') {
                        base.value = binding.value;
                        base.range = s.rangeOf(binding.pointer);
                    } else if (binding.kind === 'indexed') {
                        base.value = binding.value;
                        base.collection = binding.collection;
                        base.count = s.shipDriver.state[binding.collection]?.length ?? 0;
                    } else if (binding.kind === 'system') {
                        base.value = binding.value;
                        base.systems = s.shipDriver.systems.map((sys) => sys.pointer);
                    } else if (binding.kind === 'beam') {
                        base.value = binding.value;
                        base.beam = s.scanBeamPointer ?? null;
                    }
                    return base;
                });
                return {
                    station: s.stationName,
                    shipId: s.shipDriver.id,
                    gameMaster: s.isGameMaster,
                    widgets: s.isGameMaster ? [...stationWidgets] : s.widgets,
                    radars: s.isGameMaster ? ['gm'] : s.radarWidgets,
                    commands,
                };
            }),
    );

    server.registerTool(
        'get_ship_status',
        {
            description:
                'Read one of your station panels. Call get_capabilities for the list your seat holds. ' +
                'Panels your seat does not have belong to another crew member — ask them.',
            inputSchema: {
                widget: z.enum(stationWidgets).describe('which panel to read'),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ widget }) =>
            attempt(() => {
                const s = requireSession();
                s.requireWidget(widget);
                const reader = widgetReaders[widget];
                if (!reader) {
                    throw new InvalidCommandError(`${widget} is a radar — use get_radar_contacts`);
                }
                return reader(s);
            }),
    );

    server.registerTool(
        'get_radar_contacts',
        {
            description:
                'Everything your radar can see, nearest first. This is your whole picture of space: contacts ' +
                'outside your radar coverage are not listed, and contacts you have not scanned report as ' +
                'unidentified. Another station may hold detail you do not.',
            inputSchema: {
                offset: z.number().int().min(0).default(0).describe('skip this many contacts'),
                limit: z.number().int().min(1).max(200).default(50).describe('how many contacts to return'),
            },
            annotations: { readOnlyHint: true },
        },
        async ({ offset, limit }) =>
            attempt(() => {
                const s = requireSession();
                if (!s.isGameMaster && !s.radarWidgets.length) {
                    throw new NotPermittedError(`station "${s.stationName}" has no radar`);
                }
                const ownShip = s.spaceDriver.state.getShip(s.shipDriver.id);
                if (!ownShip) {
                    throw new InvalidCommandError('your ship is not in the space state');
                }
                const visible = s.radar.visibleObjects(s.viewFaction);
                // the tactical radar shows the gunner their own rounds in flight, wherever they are
                if (s.widgets.includes('tactical-radar')) {
                    for (const shell of s.radar.ownProjectiles(s.shipDriver.id)) {
                        visible.add(shell);
                    }
                }
                const contacts = [...visible]
                    .filter((o) => o.id !== s.shipDriver.id)
                    .map((o) => describeContact(o, s.viewFaction, ownShip.position))
                    .sort((a, b) => a.distance - b.distance);
                return {
                    ownShip: {
                        id: ownShip.id,
                        position: { x: ownShip.position.x, y: ownShip.position.y },
                        heading: ownShip.angle,
                    },
                    radarRange: s.widgets.includes('pilot-radar') ? pilotRadarRange(s) : undefined,
                    scanBeam: s.widgets.includes('long-range-radar') ? scanBeamStatus(s) : undefined,
                    total: contacts.length,
                    offset,
                    contacts: contacts.slice(offset, offset + limit),
                };
            }),
    );

    server.registerTool(
        'execute_command',
        {
            description:
                'Work your console. Only the commands your seat holds are accepted; a refusal names what you ' +
                'can do instead. Numeric values are checked against the field range before they are sent.',
            inputSchema: {
                command: z.enum(stationCommands).describe('which control to operate'),
                value: z
                    .union([z.number(), z.boolean(), z.string()])
                    .optional()
                    .describe('the value to set, for controls that take one'),
                index: z.number().int().min(0).optional().describe('which tube or gun, for weapon commands'),
                system: z.string().optional().describe('system pointer, for power and coolant commands'),
                seconds: z.number().optional().describe('how long to hold the trigger, for fire commands'),
                id: z.string().optional().describe('target id, for waypoint commands'),
                protocolId: z.string().optional().describe('repair protocol id, for enqueueRepair'),
                operationId: z.string().optional().describe('repair operation id, for repair queue commands'),
                position: z.object({ x: z.number(), y: z.number() }).optional().describe('for placeWaypoint'),
                delta: z.object({ x: z.number(), y: z.number() }).optional().describe('for moveWaypoint'),
                title: z.string().optional(),
                collection: z.string().optional(),
                color: z.number().optional(),
            },
            annotations: { openWorldHint: true },
        },
        async (raw) =>
            attempt(async () => {
                const s = requireSession();
                const { command, value, ...args } = raw as ExecuteCommandInput;
                const defined = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
                return { done: await s.execute(command, defined, value) };
            }),
    );

    return server;
}
