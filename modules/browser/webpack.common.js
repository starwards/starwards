const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
    entry: {
        gm: [path.resolve(__dirname, 'src', 'screens', 'gm.ts')],
        ship: [path.resolve(__dirname, 'src', 'screens', 'ship.ts')],
        weapons: [path.resolve(__dirname, 'src', 'screens', 'weapons.ts')],
        pilot: [path.resolve(__dirname, 'src', 'screens', 'pilot.ts')],
        engineer: [path.resolve(__dirname, 'src', 'screens', 'engineer.ts')],
        relay: [path.resolve(__dirname, 'src', 'screens', 'relay.ts')],
        signals: [path.resolve(__dirname, 'src', 'screens', 'signals.ts')],
        station: [path.resolve(__dirname, 'src', 'screens', 'station.ts')],
        index: [path.resolve(__dirname, 'src', 'screens', 'index.tsx')],
        input: [path.resolve(__dirname, 'src', 'screens', 'input.ts')],
        gallery: [path.resolve(__dirname, 'src', 'gallery', 'gallery.ts')],
    },
    module: {
        rules: [
            {
                test: /\.tsx$/,
                loader: 'esbuild-loader',
                options: {
                    loader: 'tsx',
                    target: 'es2023',
                    tsconfigRaw: require('./tsconfig.json'),
                },
            },
            {
                test: /\.ts$/,
                loader: 'esbuild-loader',
                options: {
                    loader: 'ts',
                    target: 'es2023',
                    tsconfigRaw: require('./tsconfig.json'),
                },
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
            filename: 'ship.html',
            template: path.resolve(__dirname, 'templates', 'sidebar.html'),
            chunks: ['ship'],
        }),
        new HtmlWebpackPlugin({
            filename: 'weapons.html',
            template: path.resolve(__dirname, 'templates', 'station.html'),
            chunks: ['weapons'],
        }),
        new HtmlWebpackPlugin({
            filename: 'pilot.html',
            template: path.resolve(__dirname, 'templates', 'station.html'),
            chunks: ['pilot'],
        }),
        new HtmlWebpackPlugin({
            filename: 'engineer.html',
            template: path.resolve(__dirname, 'templates', 'station.html'),
            chunks: ['engineer'],
        }),
        new HtmlWebpackPlugin({
            filename: 'relay.html',
            template: path.resolve(__dirname, 'templates', 'station.html'),
            chunks: ['relay'],
        }),
        new HtmlWebpackPlugin({
            filename: 'signals.html',
            template: path.resolve(__dirname, 'templates', 'station.html'),
            chunks: ['signals'],
        }),
        new HtmlWebpackPlugin({
            filename: 'station.html',
            template: path.resolve(__dirname, 'templates', 'station.html'),
            chunks: ['station'],
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
        new HtmlWebpackPlugin({
            filename: 'gallery.html',
            template: path.resolve(__dirname, 'templates', 'gallery.html'),
            chunks: ['gallery'],
        }),
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json', '.mjs'],
        plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('./tsconfig.json') })],
        alias: {
            // Ensure only one copy of React is used to avoid hook errors
            react: path.resolve(__dirname, '../../node_modules/react'),
            'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
        },
    },
};
