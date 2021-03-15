const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

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
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            // disable type checker - we will use it in fork plugin
                            transpileOnly: true,
                            onlyCompileBundledFiles: true,
                            configFile: path.resolve(__dirname, 'tsconfig.json'),
                        },
                    },
                ],
            },
            {
                test: /\.(png|woff|woff2|eot|ttf|svg)$/,
                use: 'file-loader?limit=1024&name=[path][name].[ext]',
            },
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false,
                },
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
        new ForkTsCheckerWebpackPlugin(),
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json', '.mjs'], // ,
        plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('../../tsconfig.json') })],
    },
};
