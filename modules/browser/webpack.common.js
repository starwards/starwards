const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = {
  entry: {
    player: [path.resolve(__dirname, "src", "player.ts")],
    index: [path.resolve(__dirname, "src", "index.tsx")],
  },  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "@ts-tools/webpack-loader"
      },
      {
        test: /\.(png|woff|woff2|eot|ttf|svg)$/,
        use: "file-loader?limit=1024&name=[path][name].[ext]"
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: "player.html",
      template: path.resolve(__dirname, "src", "player.html"),
      chunks: ['player']
    }),
    new HtmlWebpackPlugin({
      filename: "index.html",
      template: path.resolve(__dirname, "src", "index.html"),
      chunks: ['index']
    })
  ],
  resolve:  {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
    plugins: [new TsconfigPathsPlugin({ configFile: require.resolve('./src/tsconfig.json') })],
  }
};