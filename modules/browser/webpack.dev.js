const { merge } = require('webpack-merge');
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
});
