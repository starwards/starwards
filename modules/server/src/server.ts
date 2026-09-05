import * as http from 'http';
import * as maps from './maps';
import * as path from 'path';

import { GameRecorder, RecordingConflictError, isRecordingName } from './recording/game-recorder';
import { GameStatus, createLogger } from '@starwards/core/internal';
import { NextFunction, Request, Response } from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { schemaToString, stringToSchema } from './serialization/game-state-serialization';

import { AddressInfo } from 'node:net';
import { AdminRoom } from './admin/room';
import { CleanLocalPresence } from './clean-local-presence';
import { GameManager } from './admin/game-manager';
import { ReplayPlayer } from './recording/replay-player';
import { SavedGame } from './serialization/game-state-protocol';
import { ShipRoom } from './ship/room';
import { SpaceRoom } from './space/room';
import { WebSocketTransport } from '@colyseus/ws-transport';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';
import express from 'express';
import { getNetworkInfo } from './network-info';
import { getStationsManifest } from './stations-manifest';
import { monitor } from '@colyseus/monitor';

const { error: logError } = createLogger('server:http');

const mapsMap = new Map(Object.values(maps).map((m) => [m.name, m]));

// modules/server/.recordings/ (gitignored) — works from both src/ (ts-node) and cjs/ (compiled)
const DEFAULT_RECORDINGS_DIR = path.resolve(__dirname, '..', '.recordings');

function recordingsDirPath(env: Record<string, string | undefined> = process.env): string {
    return env.STARWARDS_RECORDINGS_DIR || DEFAULT_RECORDINGS_DIR;
}

export const HTTP_CONFLICT_STATUS = 409;
const HTTP_BAD_REQUEST_STATUS = 400;
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
) {
    const gameRecorder = new GameRecorder(manager, recordingsDir);
    const replayPlayer = new ReplayPlayer(manager, mapsMap);
    // reassigned once gameServer.listen() resolves the actual bound port (the caller may pass 0)
    let boundPort = port;
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
        app.use('/', express.static(dir));
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
    app.use('/colyseus-monitor', auth, monitor());

    app.use(express.json()); // for parsing application/json
    app.post(
        '/stop-game',
        asyncHandler(async (_, res) => {
            replayPlayer.stop();
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

    app.post(
        '/start-replay',
        asyncHandler(async (req, res) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const { name } = req.body;
            if (typeof name !== 'string') {
                logError(`missing "name" field to start replay`);
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
                return;
            }
            // `name` is client-supplied and joined onto recordingsDir — a path component
            // would escape the directory and read arbitrary files.
            if (!isRecordingName(name)) {
                logError(`invalid recording name "${name}"`);
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
                return;
            }
            if (manager.state.gameStatus !== GameStatus.STOPPED) {
                logError(`can't start replay: a game is already running`);
                res.sendStatus(HTTP_CONFLICT_STATUS);
                return;
            }
            try {
                await replayPlayer.startReplay(path.join(recordingsDir, name));
                res.send();
            } catch (e) {
                logError(`can't start replay "${name}":`, e);
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
            }
        }),
    );

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
                res.send(await schemaToString(gameState));
            } else {
                logError(`can't save game when no game is running`);
                res.sendStatus(HTTP_CONFLICT_STATUS);
            }
        }),
    );

    app.post(
        '/load-game',
        asyncHandler(async (req, res) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const { data } = req.body;
            if (typeof data === 'string') {
                replayPlayer.stop(); // loadGame() stops a running replay; release its reader too
                const savedGameData = await stringToSchema(SavedGame, data);
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
    const addressInfo = httpServer.address() as AddressInfo;
    boundPort = addressInfo.port;
    // console.log(`Listening on port ${addressInfo.port}`);

    await matchMaker.createRoom('admin', { manager }); // create a room
    return {
        httpServer,
        addressInfo,
        close: async () => {
            // Close the recording before the transport goes away, so no frame write outlives
            // the server (and races whoever cleans up the recordings directory).
            replayPlayer.stop();
            await gameRecorder.stopRecording();
            // Stats.persist() schedules a 1 s setTimeout when createRoom() runs shortly
            // after the previous persist.  That handle outlives gracefullyShutdown() and
            // keeps Jest worker processes alive.  Calling reset(true) here clears the
            // pending timeout and force-flushes the counters before state becomes
            // SHUTTING_DOWN (at which point Stats.persist() becomes a no-op).
            // @colyseus/core/package.json restricts sub-path exports, so we resolve
            // Stats.js via the package entry-point directory rather than a named export.

            const statsPath = path.join(path.dirname(require.resolve('@colyseus/core')), 'Stats.js');
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const Stats = require(statsPath) as { reset: (persist?: boolean) => void };
            Stats.reset(true);
            await gameServer.gracefullyShutdown(false);
        },
    };
}
