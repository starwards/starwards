/* eslint-disable no-console */
import * as http from 'http';
import * as maps from './maps';

import { NextFunction, Request, Response } from 'express';
import { Server, matchMaker } from 'colyseus';

import { AddressInfo } from 'node:net';
import { AdminRoom } from './admin/room';
import { GameManager } from './admin/game-manager';
import { ShipRoom } from './ship/room';
import { SpaceRoom } from './space/room';
import { WebSocketTransport } from '@colyseus/ws-transport';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';
import express from 'express';
import { fragmentToString } from './admin/fragment-serialization';
import { monitor } from '@colyseus/monitor';

function isMapName(arg: unknown): arg is keyof typeof maps {
    return typeof arg === 'string' && Object.keys(maps).includes(arg);
}
export const HTTP_CONFLICT_STATUS = 409;
export const HTTP_BAD_REQUEST_STATUS = 400;
export async function server(port: number, staticDir: string, manager: GameManager) {
    const app = express();
    app.use(express.json() as express.RequestHandler);
    const httpServer = http.createServer(app);
    const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

    gameServer.define('space', SpaceRoom);
    gameServer.define('admin', AdminRoom);
    gameServer.define('ship', ShipRoom).enableRealtimeListing();

    app.use('/', express.static(staticDir));

    // add colyseus monitor
    const auth = basicAuth({ users: { admin: 'admin' }, challenge: true });
    app.use('/colyseus-monitor', auth, monitor());

    app.use(express.json()); // for parsing application/json
    app.post(
        '/stop-game',
        asyncHandler(async (_, res) => {
            await manager.stopGame();
            res.send();
        })
    );

    app.post(
        '/start-game',
        asyncHandler(async (req, res) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const { mapName } = req.body;
            if (isMapName(mapName)) {
                await manager.startGame(maps[mapName]);
                res.send();
            } else {
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
            }
        })
    );

    app.post(
        '/save-game',
        asyncHandler(async (_, res) => {
            const gameState = manager.saveGame();
            if (gameState) {
                res.send(await fragmentToString(gameState));
            } else {
                res.sendStatus(HTTP_CONFLICT_STATUS);
            }
        })
    );

    app.use((err: TypeError, _req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            return next(err);
        }
        res.status(500);
        res.render('error', { error: err });
    });

    await gameServer.listen(port);
    const addressInfo = httpServer.address() as AddressInfo;
    console.log(`Listening on port ${addressInfo.port}`);

    await matchMaker.createRoom('admin', { manager }); // create a room
    return {
        httpServer,
        addressInfo,
        close: async () => await gameServer.gracefullyShutdown(false),
    };
}
