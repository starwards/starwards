const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
    entry: {
        gm: [path.resolve(__dirname, 'src', 'screens', 'gm.ts')],
        player: [path.resolve(__dirname, 'src', 'screens', 'player.ts')],
        index: [path.resolve(__dirname, 'src', 'screens', 'index.tsx')],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: '@ts-tools/webpack-loader',
            },
            {
                test: /\.(png|woff|woff2|eot|ttf|svg)$/,
                use: 'file-loader?limit=1024&name=[path][name].[ext]',
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            filename: 'player',
            template: path.resolve(__dirname, 'templates', 'sidebar.html'),
            chunks: ['player'],
        }),
        new HtmlWebpackPlugin({
            filename: 'gm',
            template: path.resolve(__dirname, 'templates', 'sidebar.html'),
            chunks: ['gm'],
        }),
        new HtmlWebpackPlugin({
            filename: 'index.html',
            template: path.resolve(__dirname, 'templates', 'main.html'),
            chunks: ['index'],
        }),
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
        plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('./src/tsconfig.json') })],
    },
};
