const { mergeWithRules } = require('webpack-merge');
const path = require('path');
const common = require('./webpack.common.js');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const { ESBuildMinifyPlugin } = require('esbuild-loader');

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
                test: /\.tsx?$/,
                loader: 'esbuild-loader',
                options: {
                    loader: 'tsx',
                    target: 'es2020',
                    tsconfigRaw: require('./tsconfig.runtime.json'),
                },
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json', '.mjs'],
        plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('./tsconfig.runtime.json') })],
    },
    optimization: { minimizer: [new ESBuildMinifyPlugin({ target: 'es2020' })] },
});
