const { mergeWithRules } = require('webpack-merge');
const path = require('path');
const common = require('./webpack.common.js');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const { EsbuildPlugin } = require('esbuild-loader');

// esbuild-loader is handed the tsconfig raw, without resolving "extends", so every compiler option
// it needs must be spelled out in the file named below. `useDefineForClassFields` is the one that
// matters: from es2022 onwards esbuild defaults it to true, and Colyseus `@gameField` accessors and
// widgets that read a sibling field from an initializer both need assignment semantics.
module.exports = mergeWithRules({
    module: {
        rules: {
            test: 'match',
            use: { loader: 'match', options: 'replace' },
        },
    },
})(common, {
    mode: 'production',
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
    },
    module: {
        rules: [
            {
                test: /\.tsx$/,
                loader: 'esbuild-loader',
                options: {
                    loader: 'tsx',
                    target: 'es2023',
                    tsconfigRaw: require('./tsconfig.runtime.json'),
                },
            },
            {
                test: /\.ts$/,
                loader: 'esbuild-loader',
                options: {
                    loader: 'ts',
                    target: 'es2023',
                    tsconfigRaw: require('./tsconfig.runtime.json'),
                },
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json', '.mjs'],
        plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('./tsconfig.runtime.json') })],
    },
    optimization: { minimizer: [new EsbuildPlugin({ target: 'es2023' })] },
});
