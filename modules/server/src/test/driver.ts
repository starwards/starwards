import { AddressInfo, Socket } from 'net';

import { EventEmitter } from 'eventemitter3';
import { GameManager } from '../admin/game-manager';
import { SavedGame } from '../serialization/game-state-protocol';
import { Server } from 'http';
import path from 'path';
import { server } from '../server';
import { stringToSchema } from '../serialization/game-state-serialization';

/**
 * Deep comparison with approximate equality for numbers to handle float32 precision loss
 */
function deepApproxEqual(a: any, b: any, tolerance = 1e-6): boolean {
    if (a === b) return true;

    if (typeof a === 'number' && typeof b === 'number') {
        if (isNaN(a) && isNaN(b)) return true;
        if (!isFinite(a) || !isFinite(b)) return a === b;
        return Math.abs(a - b) <= tolerance;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => deepApproxEqual(val, b[idx], tolerance));
    }

    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every((key) => keysB.includes(key) && deepApproxEqual(a[key], b[key], tolerance));
    }

    return false;
}

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
        await sockets?.waitForNoSockets(10_000); // Increase timeout for multi-client tests
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
        get shipManagers() {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            return gameManager.shipManagers;
        },
        getShip(id: string) {
            if (!gameManager) throw new Error('missing gameManager');
            // @ts-ignore : access private field
            const ship = this.shipManagers.get(id);
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

            const expectedSpace = this.spaceManager.state.toJSON();
            const actualSpace = data.fragment.space.toJSON();
            expect(deepApproxEqual(actualSpace, expectedSpace)).toBe(true);

            const expectedShips = [...this.shipManagers].map(([k, v]) => [k, v.state.toJSON()]);
            const actualShips = [...data.fragment.ship].map(([k, v]) => [k, v.toJSON()]);
            expect(deepApproxEqual(actualShips, expectedShips)).toBe(true);
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
        if (sockets.includes(socket)) return;
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
        waitForNoSockets(timeoutMs = 5000) {
            return new Promise<void>((res, rej) => {
                if (!sockets.length) {
                    res();
                    return; // Don't add listener if already resolved
                }

                const timeout = setTimeout(() => {
                    onSocketsChange.off('touch', handler);
                    rej(
                        new Error(`waitForNoSockets timeout after ${timeoutMs}ms, ${sockets.length} sockets remaining`),
                    );
                }, timeoutMs);

                const handler = () => {
                    if (!sockets.length) {
                        clearTimeout(timeout);
                        onSocketsChange.off('touch', handler); // Remove listener to prevent leak
                        res();
                    }
                };
                onSocketsChange.on('touch', handler);
            });
        },
    };
}
