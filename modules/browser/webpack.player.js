// Standalone static build of the recording player (player.html + the assets it loads), for hosting
// outside the game server, e.g. embedded in dev blog posts: `player.html?src=<url of a .sgr>`.
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const prod = require('./webpack.prod.js');

const staticDir = path.resolve(__dirname, '..', '..', 'static');
// unused by the player, and too heavy to ship with every blog embed
const bulky = /\/(photos\/|grass\.jpg$|screen-capture\.webm$)/;

module.exports = {
    ...prod,
    entry: { player: prod.entry.player },
    output: { filename: '[name].js', path: path.resolve(__dirname, 'dist-player'), clean: true },
    plugins: [
        ...prod.plugins.filter((p) => !(p instanceof HtmlWebpackPlugin) || p.userOptions.filename === 'player.html'),
        new CopyWebpackPlugin({
            patterns: ['styles', 'fonts', 'images', 'sound'].map((dir) => ({
                from: path.join(staticDir, dir),
                to: dir,
                filter: (file) => !bulky.test(file),
            })),
        }),
    ],
};
