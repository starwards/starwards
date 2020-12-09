import * as path from 'path';

import { server } from './server';
import webpack from 'webpack';
// eslint-disable-next-line: no-submodule-imports
import webpackConfig from '@starwards/browser/webpack.dev';
import webpackDevMiddleware from 'webpack-dev-middleware';
import webpackHotMiddleware from 'webpack-hot-middleware';

const webpackCompiler = webpack(webpackConfig);

void server(Number(process.env.PORT || 8080), path.resolve(__dirname, '..', '..', '..', 'static'), [
    webpackDevMiddleware(webpackCompiler),
    webpackHotMiddleware(webpackCompiler),
]);
