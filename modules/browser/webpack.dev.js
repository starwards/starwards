const merge = require('webpack-merge');
const webpack = require('webpack');
const common = require('./webpack.common.js');

module.exports = merge(common, {
    mode: 'development',
    devtool: 'cheap-module-eval-source-map',
    entry: {
        index: ['webpack-hot-middleware/client?reload=true'],
        player: ['webpack-hot-middleware/client?reload=true'],
        gm: ['webpack-hot-middleware/client?reload=true'],
    },
    plugins: [new webpack.HotModuleReplacementPlugin()],
});
