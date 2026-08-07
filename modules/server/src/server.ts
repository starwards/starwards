import * as http from 'http';
import * as maps from './maps';
import * as path from 'path';

import { NextFunction, Request, Response } from 'express';
import { Server, matchMaker } from '@colyseus/core';
import { schemaToString, stringToSchema } from './serialization/game-state-serialization';

import { AddressInfo } from 'node:net';
import { AdminRoom } from './admin/room';
import { CleanLocalPresence } from './clean-local-presence';
import { GameManager } from './admin/game-manager';
import { SavedGame } from './serialization/game-state-protocol';
import { ShipRoom } from './ship/room';
import { SpaceRoom } from './space/room';
import { WebSocketTransport } from '@colyseus/ws-transport';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';
import { createLogger } from '@starwards/core/internal';
import express from 'express';
import { getStationsManifest } from './stations-manifest';
import { monitor } from '@colyseus/monitor';

const { error: logError } = createLogger('server:http');

const mapsMap = new Map(Object.values(maps).map((m) => [m.name, m]));

export const HTTP_CONFLICT_STATUS = 409;
const HTTP_BAD_REQUEST_STATUS = 400;
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
) {
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
            await manager.stopGame();
            res.send();
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
    // console.log(`Listening on port ${addressInfo.port}`);

    await matchMaker.createRoom('admin', { manager }); // create a room
    return {
        httpServer,
        addressInfo,
        close: async () => {
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
