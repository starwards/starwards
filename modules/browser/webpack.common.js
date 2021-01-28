const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
    entry: {
        mainScreen: [path.resolve(__dirname, 'src', 'screens', 'main-screen.ts')],
        gm: [path.resolve(__dirname, 'src', 'screens', 'gm.ts')],
        ship: [path.resolve(__dirname, 'src', 'screens', 'ship.ts')],
        index: [path.resolve(__dirname, 'src', 'screens', 'index.tsx')],
        input: [path.resolve(__dirname, 'src', 'screens', 'input.ts')],
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
            filename: 'main-screen.html',
            template: path.resolve(__dirname, 'templates', '3d.html'),
            chunks: ['mainScreen'],
        }),
        new HtmlWebpackPlugin({
            filename: 'ship.html',
            template: path.resolve(__dirname, 'templates', 'sidebar.html'),
            chunks: ['ship'],
        }),
        new HtmlWebpackPlugin({
            filename: 'gm.html',
            template: path.resolve(__dirname, 'templates', 'sidebar.html'),
            chunks: ['gm'],
        }),
        new HtmlWebpackPlugin({
            filename: 'index.html',
            template: path.resolve(__dirname, 'templates', 'main.html'),
            chunks: ['index'],
        }),
        new HtmlWebpackPlugin({
            filename: 'input.html',
            template: path.resolve(__dirname, 'templates', 'input.html'),
            chunks: ['input'],
        }),
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
        plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('../../tsconfig.json') })],
    },
};
