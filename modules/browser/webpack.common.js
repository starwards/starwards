const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: [path.resolve(__dirname, "src", "index.ts")],
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
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "src", "index.html")
    })
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"]
  }
};
