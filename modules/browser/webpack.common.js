const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
    entry: {
        gm: [path.resolve(__dirname, 'src', 'screens', 'gm.ts')],
        ship: [path.resolve(__dirname, 'src', 'screens', 'ship.ts')],
        weapons: [path.resolve(__dirname, 'src', 'screens', 'weapons.ts')],
        pilot: [path.resolve(__dirname, 'src', 'screens', 'pilot.ts')],
        ecr: [path.resolve(__dirname, 'src', 'screens', 'ecr.ts')],
        index: [path.resolve(__dirname, 'src', 'screens', 'index.tsx')],
        input: [path.resolve(__dirname, 'src', 'screens', 'input.ts')],
    },
    module: {
        rules: [
            {
                test: /\.tsx$/,
                loader: 'esbuild-loader',
                options: {
                    loader: 'tsx',
                    target: 'es2020',
                    tsconfigRaw: require('./tsconfig.json'),
                },
            },
            {
                test: /\.ts$/,
                loader: 'esbuild-loader',
                options: {
                    loader: 'ts',
                    target: 'es2020',
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
            filename: 'ecr.html',
            template: path.resolve(__dirname, 'templates', 'station.html'),
            chunks: ['ecr'],
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
        extensions: ['.ts', '.tsx', '.js', '.json', '.mjs'],
        plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('./tsconfig.json') })],
    },
};
