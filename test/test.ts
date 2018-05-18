import * as path from 'path';
import * as webpack from 'webpack';
import { WebpackConfigurationBuilder } from '../index';

const configBuilder = new WebpackConfigurationBuilder(path.resolve(__dirname, 'build'), 'dev', {
    output: {
        filename: '[name].js',
        publicPath: '/',
    },
    typescript: {
        tsConfigFile: './src/tsconfig.json',
        tslint: {
            emitErrors: false,
            typeCheck: true,
        },
    },
    babel: {
        presets: [
            ['@babel/env', {
                targets: {
                    browsers: ['last 2 versions']
                },
                useBuiltIns: 'usage',
            }],
            '@babel/react'
        ]
    },
    react: {
        hotReload: true,
    },
    tools: {
        webpackBundleAnalyzer: {},
        webpackBundleSizeAnalyzer: {},
    },
    html: 'angular',
    resources: {
        extensions: ['png', 'gif', 'jpg', 'jpeg', 'ico', 'cur', 'svg', 'woff', 'woff2', 'eot', 'ttf'],
        urlLoad: {
            extensions: ['png', 'gif', 'jpg', 'jpeg', 'ico', 'cur', 'svg'],
            limit: 10 * 1024,
        },
        copyFiles: {
            patterns: [
                { context: 'src', from: 'index.html' },
            ],
            ignore: ['.gitignore'],
        },
    },
    clean: { exclude: ['.gitignore'] },
    env: {
        'dev': {
            devtool: 'cheap-module-source-map',
            hotReload: true,
            namedModules: true,
        },
        'prod': {
            devtool: false,
        },
    }
});
configBuilder.addEntry('bundle', './src/index.tsx');

configBuilder.build();

console.log('Configuration:');
console.log(configBuilder.config);
// console.log(JSON.stringify(config.module.rules, null, 2));

console.log('');
console.log('Required npm packages:');
console.log('  ' + configBuilder.requiredNpmPackages.join('\n  '));

export default configBuilder.config;
