# Webpack Configuration Builder

This is a utility to create webpack config from simple configuration options.

## Installation

`npm i --save-dev olee/webpack-configurator`

## Example

```ts
import * as path from 'path';
import { WebpackConfigurationBuilder } from 'webpack-configurator';

const buildPath = path.resolve(__dirname, 'build');
const env = 'dev';
const configBuilder = new WebpackConfigurationBuilder(buildPath, env, {
    output: {
        filename: '[name].js',
        publicPath: '/',
    },
    typescript: {
        tsConfigFile: './src/tsconfig.json',
        tslint: true,
    },
    babel: false,
    react: {
        hotReload: true,
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

// Add entry point named 'bundle'
configBuilder.addEntry('bundle', './src/index.tsx');

// Build the configuration
configBuilder.build();

// Log required npm packages (for debug purpose)
console.log(configBuilder.requiredNpmPackages);

export default configBuilder.config; // export the generated configuration
```
