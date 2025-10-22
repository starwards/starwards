const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'source-map', //'cheap-module-eval-source-map',
    devServer: {
        // index: '',
        hot: false,
        port: 3000,
        allowedHosts: 'all',
        // contentBase: ''
        proxy: [
            {
                context: ['/colyseus'],
                target: 'http://localhost:8080',
                // changeOrigin: true,
                ws: true,
            },
            {
                context: ['/sockjs-node'],
                target: 'ws://localhost:8080',
                // changeOrigin: true,
            },
            {
                context: ['/'],
                target: 'http://localhost:8080',
                // changeOrigin: true,
            },
        ],
        client: {
            overlay: {
                runtimeErrors: (error) => {
                    if (error?.message === 'ResizeObserver loop completed with undelivered notifications.') {
                        // eslint-disable-next-line no-console
                        console.error(error);
                        return false;
                    }

                    // Enhanced logging for debugging errors
                    // eslint-disable-next-line no-console
                    console.error('Runtime error caught:', {
                        error,
                        message: error?.message,
                        name: error?.name,
                        stack: error?.stack,
                        cause: error?.cause,
                        ...error,
                    });

                    // Fix error message if it's [object Object]
                    // This happens when webpack wraps an error object in new Error(errorObj)
                    if (
                        error?.message &&
                        typeof error.message === 'string' &&
                        error.message.includes('[object Object]')
                    ) {
                        // Return a new error with the correct message for the overlay
                        const cause = error.cause;
                        let fixedMessage = error.message;

                        if (cause && typeof cause === 'object') {
                            if (cause.message) {
                                fixedMessage = fixedMessage.replace('[object Object]', cause.message);
                            } else {
                                const causeStr = JSON.stringify(cause, Object.getOwnPropertyNames(cause));
                                fixedMessage = fixedMessage.replace('[object Object]', causeStr);
                            }
                        }

                        const fixedError = new Error(fixedMessage);
                        fixedError.stack = error.stack;
                        return fixedError;
                    }

                    return true;
                },
            },
        },
    },
});
