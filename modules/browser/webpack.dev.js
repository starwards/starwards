const { merge } = require('webpack-merge');
const webpack = require('webpack');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'source-map', //'cheap-module-eval-source-map',
    devServer: {
        // index: '',
        hot: false,
        port: 80,
        disableHostCheck: true,
        // contentBase: ''
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                ws: true,
                // changeOrigin: true,
            },
            '/sockjs-node': {
                target: 'ws://localhost:8080',
                // ws: true,
                // changeOrigin: true,
            },
            '/': {
                target: 'http://localhost:8080',
                // ws: true,
                // changeOrigin: true,
            },
        },
    },
    entry: {
        // mainScreen: ['webpack-hot-middleware/client?reload=true'],
        index: ['webpack-hot-middleware/client?reload=true'],
        ship: ['webpack-hot-middleware/client?reload=true'],
        gm: ['webpack-hot-middleware/client?reload=true'],
    },
    plugins: [new webpack.HotModuleReplacementPlugin()],
});
