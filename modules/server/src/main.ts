// tslint:disable-next-line:no-reference
/// <reference path="../../../custom-typings/index.d.ts" />
/*
 * embed webpack-dev-server
 */

import * as colyseus from 'colyseus';
import * as http from 'http';
import express = require('express');
import * as path from 'path';
import basicAuth = require('express-basic-auth');
import { monitor } from '@colyseus/monitor';

import { ArenaRoom } from './rooms/ArenaRoom';
import { SpaceRoom } from './space/room';

import webpack = require('webpack');
import webpackDevMiddleware = require('webpack-dev-middleware');
import webpackConfig = require('../../browser/webpack.config');
import webpackHotMiddleware = require('webpack-hot-middleware');

export const port = Number(process.env.PORT || 8080);
export const endpoint = 'localhost';

export let STATIC_DIR: string;

const app = express();
const gameServer = new colyseus.Server({ server: http.createServer(app) });

gameServer.register('arena', ArenaRoom);
gameServer.register('space', SpaceRoom);

if (process.env.NODE_ENV === 'production') {
    // on production, use ./public as static root
    STATIC_DIR = path.resolve(__dirname, 'public');
} else {
    const webpackCompiler = webpack(webpackConfig());
    app.use(webpackDevMiddleware(webpackCompiler));
    app.use(webpackHotMiddleware(webpackCompiler));

    // on development, use "../../" as static root
    STATIC_DIR = path.resolve(__dirname, '..', '..', '..', 'static');
}

app.use('/', express.static(STATIC_DIR));

// add colyseus monitor
const auth = basicAuth({ users: { admin: 'admin' }, challenge: true });
app.use('/colyseus', auth, monitor(gameServer));

gameServer.listen(port);
// tslint:disable-next-line:no-console
console.log(`Listening on http://${endpoint}:${port}`);
