const webpack = require("webpack");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = function(_) {
  const mode = process.env.NODE_ENV || "development"
  return {
    mode,
    entry: [
      "webpack-hot-middleware/client?reload=true",
      path.resolve(__dirname, "src", "index.ts")
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "@ts-tools/webpack-loader",
          options: {
            warnOnly: true
          }
        },
        {
          test: /\.(png|woff|woff2|eot|ttf|svg)$/,
          use: "file-loader?limit=1024&name=[path][name].[ext]"
        }
      ]
    },
    plugins: [
      new webpack.HotModuleReplacementPlugin(),

      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "src", "index.html")
      })
    ],
    resolve: {
      extensions: [".tsx", ".ts", ".js"]
    },
    output: {
      filename: "bundle.js",
      path: path.resolve(__dirname, "lib", "public")
    }
  };
};
