/*
 * embed webpack-dev-server
 */

import * as colyseus from 'colyseus';
import * as http from 'http';
import express = require('express');
import basicAuth = require('express-basic-auth');
import { monitor } from '@colyseus/monitor';
import { SpaceRoom } from './space/room';
import { NextHandleFunction } from 'connect';

export function server(port: number, staticDir: string, handlers?: NextHandleFunction[] ) {
  const app = express();
  const gameServer = new colyseus.Server({ server: http.createServer(app) });

  gameServer.register('space', SpaceRoom);
  // .then(handler => {
  //     handler.
  //       on('create', room => console.log('room created:', room.roomId)).
  //       on('dispose', room => console.log('room disposed:', room.roomId)).
  //       on('join', (room, client) => console.log(client.sessionId, 'joined', room.roomId)).
  //       on('leave', (room, client) => console.log(client.sessionId, 'left', room.roomId));
  //   });

  if (handlers) {
    app.use(...handlers);
  }

  app.use('/', express.static(staticDir));

  // add colyseus monitor
  const auth = basicAuth({ users: { admin: 'admin' }, challenge: true });
  app.use('/colyseus', auth, monitor(gameServer));

  gameServer.listen(port);
  // tslint:disable-next-line:no-console
  console.log(`Listening on port ${port}`);

  process.on('uncaughtException', function(err) {
    // tslint:disable-next-line:no-console
    console.error(
      new Date().toUTCString() + ' uncaughtException:',
      err.message
    );
    // tslint:disable-next-line:no-console
    console.error(err.stack);
    // process.exit(1);
  });
}
