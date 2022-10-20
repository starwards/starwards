import { AddressInfo, Socket } from 'net';

import { EventEmitter } from 'eventemitter3';
import { GameManager } from '../admin/game-manager';
import { SavedGame } from '../serialization/game-state-protocol';
import { Server } from 'http';
import path from 'path';
import { server } from '../server';
import { stringToSchema } from '../serialization/game-state-serialization';

export function makeDriver() {
    let gameManager: GameManager | null = null;
    let serverInfo: Awaited<ReturnType<typeof server>> | null = null;
    let sockets: ReturnType<typeof makeSocketsControls> | null = null;

    const url = () => {
        if (!serverInfo) throw new Error('missing serverInfo');
        return `http://localhost:${serverInfo.addressInfo.port}/`;
    };

    beforeEach(async () => {
        gameManager = new GameManager();
        serverInfo = await server(0, path.resolve(__dirname, '..', '..', '..', 'static'), gameManager);
        sockets = makeSocketsControls(serverInfo.httpServer);
    });

    afterEach(async () => {
        await gameManager?.stopGame();
        await serverInfo?.close();
        await sockets?.waitForNoSockets();
    });

    return {
        url,
        get httpServer() {
            if (!serverInfo) throw new Error('missing serverInfo');
            return serverInfo.httpServer;
        },
        get sockets() {
            if (!sockets) throw new Error('missing sockets');
            return sockets;
        },
        pauseGameCommand() {
            this.gameManager.state.speed = 0;
        },
        get gameManager() {
            if (!gameManager) throw new Error('missing gameManager');
            return gameManager;
        },
        get spaceManager() {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            return gameManager.spaceManager;
        },
        get ships() {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            return gameManager.ships;
        },
        getShip(id: string) {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            const ship = gameManager.ships.get(id);
            if (!ship) throw new Error('missing ship ' + id);
            return ship;
        },
        get map() {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            return gameManager.map;
        },
        async assertSameState(savedGame: string) {
            const data = await stringToSchema(SavedGame, savedGame);

            expect(data.mapName).toEqual(this.map?.name);
            expect(data.fragment.space.toJSON()).toEqual(this.spaceManager.state.toJSON());
            expect([...data.fragment.ship].map(([k, v]) => [k, v.toJSON()])).toEqual(
                [...this.ships].map(([k, v]) => [k, v.state.toJSON()])
            );
        },
    };
}

/**
 * API to stop and resume the server's socket level communication
 */
export function makeSocketsControls(netServer: Server) {
    const sockets: Socket[] = [];
    const onSocketsChange = new EventEmitter();
    const onConnection = (socket: Socket): void => {
        sockets.push(socket);
        socket.once('close', () => {
            sockets.splice(sockets.indexOf(socket), 1);
            onSocketsChange.emit('touch');
        });
        onSocketsChange.emit('touch');
    };
    netServer.on('connection', onConnection);
    netServer.on('secureConnection', onConnection);

    let lastPort = -1;
    return {
        stop: () => {
            lastPort = (netServer.address() as AddressInfo).port;
            const result = new Promise<void>((res, rej) => netServer.close((err?: Error) => (err ? rej(err) : res())));
            for (const socket of sockets) {
                socket.destroy();
            }
            sockets.splice(0);
            return result;
        },
        resume: () => {
            if (lastPort === -1) {
                throw new Error('server was not stopped');
            }
            const result = new Promise<void>((res) => netServer.listen(lastPort, res));
            lastPort = -1;
            return result;
        },
        waitForNoSockets() {
            return new Promise<void>((res) => {
                if (!sockets.length) {
                    res();
                }
                onSocketsChange.on('touch', () => {
                    if (!sockets.length) {
                        res();
                    }
                });
            });
        },
    };
}
