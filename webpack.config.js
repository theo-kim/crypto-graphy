const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  plugins: [new MiniCssExtractPlugin({
    filename: '../res/css/style.css',
  })],
  externals: ["fs"],
  entry: {
    ts: './src/index.tsx',
    less: './res/css/index.less'
  },
  devtool: "cheap-module-source-map",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.less$/,
        use: [ MiniCssExtractPlugin.loader, 'css-loader', 'less-loader' ],
      },
    ],
  },
  resolve: {
    extensions: [ '.tsx', '.ts', '.js', '.css'],
  },
  output: {
    filename: 'bundle-[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
};