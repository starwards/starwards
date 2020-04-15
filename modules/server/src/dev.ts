// tslint:disable: no-implicit-dependencies
import { server } from './server';
import * as path from 'path';
import webpack from 'webpack';
import webpackDevMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';
// tslint:disable-next-line: no-submodule-imports
import webpackConfig from '@starwards/browser/webpack.dev';

const webpackCompiler = webpack(webpackConfig);

server(Number(process.env.PORT || 8080), path.resolve(__dirname, '..', '..', '..', 'static'), [
    webpackDevMiddleware(webpackCompiler),
    webpackHotMiddleware(webpackCompiler),
]);
