import { AddressInfo, Socket } from 'net';

import { Server } from 'http';

export function makeSocketsControls(server: Server) {
    const sockets: Socket[] = [];

    const onConnection = (socket: Socket): void => {
        sockets.push(socket);
        socket.once('close', () => sockets.splice(sockets.indexOf(socket), 1));
    };
    server.on('connection', onConnection);
    server.on('secureConnection', onConnection);

    let lastPort = -1;
    return {
        stop: () => {
            lastPort = (server.address() as AddressInfo).port;
            const result = new Promise<void>((res, rej) => server.close((err?: Error) => (err ? rej(err) : res())));
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
            const result = new Promise<void>((res) => server.listen(lastPort, res));
            lastPort = -1;
            return result;
        },
    };
}
