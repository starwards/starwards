import * as http from 'http';
import * as maps from './maps';
import * as path from 'path';

import { EVENTS_ZST_EXT, SavedGame, createLogger } from '@starwards/core/internal';
import { GameRecorder, RecordingConflictError, isRecordingFileName } from './recording/game-recorder';
import { NextFunction, Request, Response } from 'express';
import { SEA_MONITOR_PREFIX, SEA_STATIC_PREFIX, isSingleExecutable, writableDefault } from './app-paths';
import { Server, matchMaker } from '@colyseus/core';
import { savedGameToSchema, schemaToSavedGame, stringToSchema } from './serialization/game-state-serialization';

import { AddressInfo } from 'node:net';
import { AdminRoom } from './admin/room';
import { BotSupervisor } from './bots/supervisor';
import { CleanLocalPresence } from './clean-local-presence';
import { GameManager } from './admin/game-manager';
import { ShipRoom } from './ship/room';
import { SpaceRoom } from './space/room';
import { WebSocketTransport } from '@colyseus/ws-transport';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';
import { embeddedStatic } from './embedded-static';
import express from 'express';
import { getNetworkInfo } from './network-info';
import { getStationsManifest } from './stations-manifest';
import { monitor } from '@colyseus/monitor';

const { error: logError } = createLogger('server:http');

const mapsMap = new Map(Object.values(maps).map((m) => [m.name, m]));

// modules/server/.recordings/ (gitignored) — works from both src/ (ts-node) and cjs/ (compiled)
const DEFAULT_RECORDINGS_DIR = writableDefault(path.resolve(__dirname, '..', '.recordings'));

function recordingsDirPath(env: Record<string, string | undefined> = process.env): string {
    return env.STARWARDS_RECORDINGS_DIR || DEFAULT_RECORDINGS_DIR;
}

// With deltas (SPEC-0006, on unless STARWARDS_RECORDING_DELTAS=0) the room patches carry the 50 ms
// detail, so full snapshots are only 1000 ms keyframes. Without them every frame is a full snapshot:
// shell blasts (core space/projectile.ts) live 1 / BLAST_LIFETIME_FACTOR ≈ 333 ms, so 100 ms gives them
// 3+ frames. STARWARDS_RECORDING_INTERVAL_MS overrides either.
const DEFAULT_KEYFRAME_INTERVAL_MS = 1000;
const DEFAULT_SNAPSHOT_INTERVAL_MS = 100;

/** live-game recording frame (keyframe) interval; override with STARWARDS_RECORDING_INTERVAL_MS */
export function recordingIntervalMs(env: Record<string, string | undefined> = process.env): number {
    const raw = env.STARWARDS_RECORDING_INTERVAL_MS;
    if (!raw) {
        return env.STARWARDS_RECORDING_DELTAS === '0' ? DEFAULT_SNAPSHOT_INTERVAL_MS : DEFAULT_KEYFRAME_INTERVAL_MS;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`STARWARDS_RECORDING_INTERVAL_MS must be a positive integer, got ${JSON.stringify(raw)}`);
    }
    return value;
}

export const HTTP_CONFLICT_STATUS = 409;
const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_NOT_FOUND_STATUS = 404;
/** Largest saved game file `/load-game` accepts. */
const SAVED_GAME_LIMIT = '256mb';
const HTTP_INTERNAL_SERVER_ERROR_STATUS = 500;
export async function server(
    port: number,
    staticDirs: string | string[],
    manager: GameManager,
    // Test-only escape hatch: test/driver.ts passes { pingInterval: 0 } to prevent a
    // 3 s setInterval from outliving gracefullyShutdown() in Jest teardown.
    // WebSocketTransport.shutdown() calls httpServer.close() without awaiting the
    // resulting "close" event, so clearInterval(pingInterval) never fires in time.
    // Production/dev omit this so Colyseus's normal ping heartbeat (dead-connection
    // detection) stays active.
    wsTransportOverrides?: { pingInterval?: number; pingMaxRetries?: number },
    recordingsDir: string = recordingsDirPath(),
    /** off only for tests that drive their own `GameRecorder` on this game */
    { recordEveryGame = true }: { recordEveryGame?: boolean } = {},
) {
    const gameRecorder = new GameRecorder(manager, recordingsDir, recordingIntervalMs());
    // reassigned once gameServer.listen() resolves the actual bound port (the caller may pass 0)
    let boundPort = port;
    const bots = new BotSupervisor(
        manager,
        () => `http://localhost:${boundPort}`,
        (e) => gameRecorder.appendEvent(e),
    );
    gameRecorder.onRecordingChange = (on) => bots.setRecording(on);
    if (recordEveryGame) gameRecorder.recordEveryGame();
    manager.botSeats = bots;
    const app = express();
    app.use(express.json() as express.RequestHandler);
    const httpServer = http.createServer(app);
    const gameServer = new Server({
        transport: new WebSocketTransport({ server: httpServer, ...wsTransportOverrides }),
        greet: false,
        presence: new CleanLocalPresence(),
        ...(process.env.JEST_WORKER_ID
            ? { logger: { debug: () => {}, error: () => {}, info: () => {}, trace: () => {}, warn: () => {} } }
            : {}),
    });

    gameServer.define('space', SpaceRoom);
    gameServer.define('admin', AdminRoom);
    gameServer.define('ship', ShipRoom).enableRealtimeListing();

    // Serve static files from one or more directories
    const dirs = Array.isArray(staticDirs) ? staticDirs : [staticDirs];
    for (const dir of dirs) {
        app.use('/', isSingleExecutable ? embeddedStatic(SEA_STATIC_PREFIX) : express.static(dir));
    }

    app.get('/health', (_, res) => {
        res.json({ status: 'ok' });
    });

    // what a phone on the same Wi-Fi should type into its browser — the lobby renders these as QR codes
    app.get('/network-info', (_, res) => {
        res.json(getNetworkInfo(boundPort));
    });

    // the bridge a ship offers: which stations exist and what each may see and do. Headless clients
    // read this to scope themselves to a seat; unknown ships still get the default bridge, because
    // a manifest describes a ship model, not a live game object.
    app.get('/stations-manifest/:shipId', (req, res) => {
        res.json(getStationsManifest(req.params.shipId));
    });

    // add colyseus monitor
    const auth = basicAuth({ users: { admin: 'admin' }, challenge: true });
    if (isSingleExecutable) {
        // the monitor serves its UI from its own __dirname, which bundling erases
        app.use('/colyseus-monitor', auth, embeddedStatic(SEA_MONITOR_PREFIX));
    }
    app.use('/colyseus-monitor', auth, monitor());

    app.use(express.json()); // for parsing application/json
    app.post(
        '/stop-game',
        asyncHandler(async (_, res) => {
            await gameRecorder.stopRecording();
            await manager.stopGame();
            res.send();
        }),
    );

    app.get(
        '/recordings',
        asyncHandler(async (_, res) => {
            res.json(await gameRecorder.listRecordings());
        }),
    );

    app.post(
        '/start-recording',
        asyncHandler(async (_, res) => {
            try {
                const name = await gameRecorder.startRecording();
                res.json({ name });
            } catch (e) {
                logError(`can't start recording:`, e);
                res.sendStatus(
                    e instanceof RecordingConflictError ? HTTP_CONFLICT_STATUS : HTTP_INTERNAL_SERVER_ERROR_STATUS,
                );
            }
        }),
    );

    app.post(
        '/stop-recording',
        asyncHandler(async (_, res) => {
            // the summary is the GM's confirmation that the file landed, so it goes back in
            // the response instead of making them hunt for it in the recordings list
            res.json(await gameRecorder.stopRecording());
        }),
    );

    app.get('/recordings/:name', (req, res) => {
        // `name` is client-supplied and joined onto recordingsDir — a path component would
        // escape the directory and read arbitrary files.
        const { name } = req.params;
        if (!isRecordingFileName(name)) {
            logError(`invalid recording name "${name}"`);
            res.sendStatus(HTTP_BAD_REQUEST_STATUS);
            return;
        }
        res.type(name.endsWith(EVENTS_ZST_EXT) ? 'application/zstd' : 'text/plain');
        // `root`, not a joined path: express refuses any path with a hidden segment, and the default
        // recordings directory is `.recordings`
        res.sendFile(name, { root: recordingsDir }, (err) => {
            if (err && !res.headersSent) res.sendStatus(HTTP_NOT_FOUND_STATUS);
        });
    });

    app.post(
        '/start-game',
        asyncHandler(async (req, res) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const { mapName } = req.body;
            const map = mapsMap.get(String(mapName));
            if (map) {
                await manager.startGame(map);
                res.send();
            } else {
                logError(`can't find map named "${String(mapName)}`);
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
            }
        }),
    );

    app.post(
        '/save-game',
        asyncHandler(async (_, res) => {
            const gameState = manager.saveGame();
            if (gameState) {
                res.type('application/octet-stream').send(await schemaToSavedGame(gameState));
            } else {
                logError(`can't save game when no game is running`);
                res.sendStatus(HTTP_CONFLICT_STATUS);
            }
        }),
    );

    app.post(
        '/load-game',
        express.raw({ type: 'application/octet-stream', limit: SAVED_GAME_LIMIT }) as express.RequestHandler,
        asyncHandler(async (req, res) => {
            // a saved game file as is (either format), or the older JSON `{ data }` of its text form
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const { data } = req.body;
            const file: Uint8Array | undefined = Buffer.isBuffer(req.body) ? req.body : undefined;
            if (file || typeof data === 'string') {
                const savedGameData = await (
                    file ? savedGameToSchema(SavedGame, file) : stringToSchema(SavedGame, data as string)
                ).catch((e: unknown) => {
                    logError(`can't read saved game:`, e);
                    return null;
                });
                if (!savedGameData) {
                    res.sendStatus(HTTP_BAD_REQUEST_STATUS);
                    return;
                }
                const map = mapsMap.get(savedGameData.mapName);
                if (map) {
                    await manager.loadGame(savedGameData, map);
                    res.send();
                } else {
                    logError(`can't find map named "${savedGameData.mapName}`);
                    res.sendStatus(HTTP_BAD_REQUEST_STATUS);
                }
            } else {
                logError(`missing "data" field to load game`);
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
            }
        }),
    );

    app.use((err: TypeError, _req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(err);
        }
        res.status(500);
        res.json({
            message: err.message,
            error: err,
            stack: err.stack,
        });
    });

    await gameServer.listen(port);
    // Clients use the endpoint `<host>/colyseus` (the webpack dev proxy forwards that prefix as-is).
    // Colyseus 0.16 matched `/matchmake/` anywhere in the URL; 0.18 routes exact paths, so strip the
    // prefix ahead of the router that listen() registered. WS upgrades match the room id by suffix.
    httpServer.prependListener('request', (req: http.IncomingMessage) => {
        if (req.url) {
            req.url = req.url.replace(/^\/+colyseus(?=\/matchmake\/)/, '');
        }
    });
    const addressInfo = httpServer.address() as AddressInfo;
    boundPort = addressInfo.port;
    // console.log(`Listening on port ${addressInfo.port}`);

    await matchMaker.createRoom('admin', { manager }); // create a room
    return {
        httpServer,
        addressInfo,
        close: async () => {
            // Bot workers hold client connections to this server: drain them while it still answers.
            await bots.stopAll();
            await gameRecorder.stopRecordingEveryGame();
            // Close the recording before the transport goes away, so no frame write outlives
            // the server (and races whoever cleans up the recordings directory).
            await gameRecorder.stopRecording();
            // Stats.persist() schedules a 1 s setTimeout when createRoom() runs shortly
            // after the previous persist.  That handle outlives gracefullyShutdown() and
            // keeps Jest worker processes alive.  Calling reset(true) here clears the
            // pending timeout and force-flushes the counters before state becomes
            // SHUTTING_DOWN (at which point Stats.persist() becomes a no-op).
            // `@colyseus/core/Stats` resolves through the same export conditions as `@colyseus/core`
            // (the ESM build under node's `module-sync`), so this is the instance the matchmaker uses.
            // A single executable has no node_modules to resolve from, and only tests call close().
            if (!isSingleExecutable) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const Stats = require('@colyseus/core/Stats') as { reset: (persist?: boolean) => void };
                Stats.reset(true);
            }
            await gameServer.gracefullyShutdown(false);
        },
    };
}
