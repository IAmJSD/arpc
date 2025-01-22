const path = require("path");

const m = {
    rules: [
        {
            test: /\.ts$/,
            exclude: [/node_modules/],
            loader: "builtin:swc-loader",
            options: {
                jsc: {
                    parser: {
                        syntax: "typescript",
                    },
                },
            },
            type: "javascript/auto",
        },
    ],
};

const resolve = {
    extensions: [".ts", ".js"],
};

module.exports = [
    {
        module: m,
        mode: "production",
        entry: "./client-inline-blocking/index.ts",
        resolve,
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "client-inline-blocking.js",
        },
        devtool: false,
    },
];
