/* eslint-disable no-console */
import * as http from 'http';
import * as maps from './maps';

import { NextFunction, Request, Response } from 'express';
import { Server, matchMaker } from 'colyseus';
import { schemaToString, stringToSchema } from './serialization/game-state-serialization';

import { AddressInfo } from 'node:net';
import { AdminRoom } from './admin/room';
import { GameManager } from './admin/game-manager';
import { SavedGame } from './serialization/game-state-protocol';
import { ShipRoom } from './ship/room';
import { SpaceRoom } from './space/room';
import { WebSocketTransport } from '@colyseus/ws-transport';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';
import express from 'express';
import { makeSocketsControls } from './sockets-controls';
import { monitor } from '@colyseus/monitor';

const mapsMap = new Map(Object.values(maps).map((m) => [m.name, m]));

export const HTTP_CONFLICT_STATUS = 409;
const HTTP_BAD_REQUEST_STATUS = 400;
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
            const map = mapsMap.get(String(mapName));
            if (map) {
                await manager.startGame(map);
                res.send();
            } else {
                console.error(`can't find map named "${String(mapName)}`);
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
            }
        })
    );

    app.post(
        '/save-game',
        asyncHandler(async (_, res) => {
            const gameState = manager.saveGame();
            if (gameState) {
                res.send(await schemaToString(gameState));
            } else {
                console.error(`can't save game when no game is running`);
                res.sendStatus(HTTP_CONFLICT_STATUS);
            }
        })
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
                    console.error(`can't find map named "${savedGameData.mapName}`);
                    res.sendStatus(HTTP_BAD_REQUEST_STATUS);
                }
            } else {
                console.error(`missing "data" field to load game`);
                res.sendStatus(HTTP_BAD_REQUEST_STATUS);
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

    const sockets = makeSocketsControls(httpServer);
    await gameServer.listen(port);
    const addressInfo = httpServer.address() as AddressInfo;
    // console.log(`Listening on port ${addressInfo.port}`);

    await matchMaker.createRoom('admin', { manager }); // create a room
    return {
        httpServer,
        sockets,
        addressInfo,
        close: async () => await gameServer.gracefullyShutdown(false),
    };
}
