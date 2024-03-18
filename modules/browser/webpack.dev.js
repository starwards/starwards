const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'source-map', //'cheap-module-eval-source-map',
    devServer: {
        // index: '',
        hot: false,
        port: 80,
        allowedHosts: 'all',
        // contentBase: ''
        proxy: {
            '/colyseus': {
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
        client: {
            overlay: {
                runtimeErrors: (error) => {
                    if (error?.message === 'ResizeObserver loop completed with undelivered notifications.') {
                        // eslint-disable-next-line no-console
                        console.error(error);
                        return false;
                    }
                    return true;
                },
            },
        },
    },
});
