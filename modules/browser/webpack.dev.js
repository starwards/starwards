const merge = require("webpack-merge");
const webpack = require("webpack");
const common = require("./webpack.common.js");

module.exports = merge(common, {
  mode: "development",
  entry: {
    main: ["webpack-hot-middleware/client?reload=true"],
    player: ["webpack-hot-middleware/client?reload=true"],
  },
  plugins: [new webpack.HotModuleReplacementPlugin()]
});
