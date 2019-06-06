const path = require('path');

module.exports = {
    entry: "./src/debugger_frontend.ts",
    output: {
        filename: "debugger_frontend.js",
        path: path.resolve(__dirname, 'dist')
    },
    optimization: {
        minimize: false,
    },
    resolve: {
        extensions: [".webpack.js", ".web.js", ".ts", ".js"]
    },
    module: {
        rules: [{ test: /\.ts$/, loader: "ts-loader" }]
    }
 }
