"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const _ = require("lodash");
const mockRequire = require("mock-require");
const webpack = require("webpack");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
mockRequire('webpack-module-hot-accept', function (source, map) {
    if (!/\bmodule.hot\b/.test(source)) {
        source = source + `
if (module.hot) {
    module.hot.accept(function(err) {
        if (err) console.error(err);
    });
}
`;
    }
    if (this.cacheable)
        this.cacheable();
    let callback = this.async();
    if (callback)
        return callback(undefined, source, map);
    return source;
});
function mergeWithArrayConcat(objValue, srcValue) {
    if (objValue instanceof Array) {
        return objValue.concat(srcValue);
    }
}
class WebpackConfigurationBuilder {
    constructor(outDir, env = 'dev', options) {
        this.outDir = outDir;
        this.env = env;
        this._config = {
            entry: {},
            output: {
                filename: undefined,
                path: undefined,
            },
            resolve: {
                extensions: ['.js'],
            },
            devtool: false,
            devServer: {
                contentBase: undefined,
                historyApiFallback: true,
                compress: true,
                // port: PORT,
                lazy: false,
                hot: true,
                overlay: {
                    warnings: true,
                    errors: true,
                },
            },
            plugins: [],
            module: {
                rules: [],
            }
        };
        this._built = false;
        this._requiredNpmPackages = {};
        this.options = _.cloneDeep(options);
        if (this.env) {
            if (this.options.env[this.env]) {
                _.mergeWith(this.options, this.options.env[this.env], mergeWithArrayConcat);
            }
            else if (this.env !== 'dev') {
                console.warn(`Environment ${this.env} set but not configured`);
            }
        }
        if (this.options.output === undefined)
            this.options.output = {};
        if (this.options.resources === undefined)
            this.options.resources = {};
        if (this.options.css === undefined)
            this.options.css = {};
        if (this.options.devtool === undefined)
            this.options.devtool = 'cheap-module-source-map';
        if (this.options.html === undefined)
            this.options.html = 'resource';
        if (this.options.hotReload === undefined)
            this.options.hotReload = true;
        if (this.options.react) {
            if (this.options.react.hotReload === undefined)
                this.options.react.hotReload = true;
        }
        if (this.options.babel) {
            if (!this.options.babel.plugins)
                this.options.babel.plugins = [];
            if (this.options.react && this.options.react.hotReload && this.options.babel.plugins.indexOf('react-hot-loader/babel') < 0)
                this.options.babel.plugins.push('react-hot-loader/babel');
        }
    }
    addRule(test, enforce) {
        if (!(test instanceof RegExp)) {
            if (typeof test === 'string')
                test = this.extensionRegExp(test);
            else
                test = this.extensionsRegExp(test);
        }
        let builder = new WebpackRuleBuilder(this.options, test, enforce);
        this._config.module.rules.push(builder.rule);
        return builder;
    }
    testRule(name, enforce) {
        for (let rule of this._config.module.rules)
            if (rule.enforce === enforce && rule.test.test(name))
                return true;
        return false;
    }
    testExtension(ext, enforce) {
        return this.testRule('test.' + ext, enforce);
    }
    extensionsRegExp(ext) {
        if (ext.length === 0)
            throw new Error('requires at least one extension');
        return new RegExp(`.(${ext.join('|')})$`, 'i');
    }
    extensionRegExp(...ext) {
        return this.extensionsRegExp(ext);
    }
    requireNpmPackage(pkg, devOnly = true) {
        this._requiredNpmPackages[pkg] = devOnly;
    }
    get requiredNpmPackages() {
        return Object.keys(this._requiredNpmPackages).sort();
    }
    addPlugin(plugin) {
        this._config.plugins.push(plugin);
    }
    addEntry(key, file, options = {}) {
        if (this._config.entry[key])
            throw new Error(`Duplicate webpack entry with key ${key}`);
        if (!(file instanceof Array))
            file = [file];
        if (options.react !== false && this.options.hotReload && this.options.react && this.options.react.hotReload) {
            file.unshift('react-hot-loader/patch');
        }
        if (options.babelPolyfill && this.options.babel)
            file.unshift('babel-polyfill');
        this._config.entry[key] = file;
    }
    build() {
        if (this._built)
            throw new Error('build() must only be called once!');
        this._built = true;
        if (this.options.clean) {
            this.addPlugin(new CleanWebpackPlugin(path.resolve(this.outDir, '**'), {
                exclude: this.options.clean.exclude,
            }));
        }
        if (this.options.namedModules) {
            this.addPlugin(new webpack.NamedModulesPlugin());
        }
        if (this.options.hotReload) {
            this.addPlugin(new webpack.HotModuleReplacementPlugin());
        }
        if (this.options.resources.copyFiles) {
            this.addPlugin(new CopyWebpackPlugin(this.options.resources.copyFiles.patterns, {
                ignore: this.options.resources.copyFiles.ignore,
            }));
        }
        if (this.options.defines) {
            this.addPlugin(new webpack.DefinePlugin(this.options.defines));
        }
        // if (this.isDebug) {
        //     this.addPlugin(new webpack.LoaderOptionsPlugin({ debug: true }));
        // }
        this._config.devtool = this.options.devtool;
        this._config.devServer.contentBase = this.outDir;
        this._config.output.path = this.outDir;
        this._config.output.filename = this.options.output.filename || '[name].[hash].js';
        this._config.output.publicPath = this.options.output.publicPath;
        if (this.options.babel) {
            this.requireNpmPackage('babel-loader@8.0.0-beta.0');
            this.requireNpmPackage('@babel/core');
            this.requireNpmPackage('@babel/polyfill');
            this.requireNpmPackage('@babel/preset-env');
            if (this.options.react)
                this.requireNpmPackage('@babel/preset-react');
            if (!this.testExtension('js')) {
                this.addRule('js')
                    .exclude(/node_modules/)
                    .addBabelLoader();
            }
            else {
                console.warn('Rule for .tsx already registerd - skipping');
            }
        }
        if (this.options.typescript) {
            if (this._config.resolve.extensions.indexOf('.ts') < 0)
                this._config.resolve.extensions.push('.ts');
            this.requireNpmPackage('typescript');
            this.requireNpmPackage('ts-loader');
            if (!this.testExtension('ts')) {
                this.addRule('ts')
                    .exclude(/node_modules/)
                    .addLoader('ts-loader')
                    .addBabelLoader();
            }
            else {
                console.warn('Rule for .ts already registerd - skipping');
            }
            if (this.options.typescript.tslint) {
                this.requireNpmPackage('tslint');
                this.requireNpmPackage('tslint-loader');
                this.addRule('ts', 'pre')
                    .addLoader('tslint-loader', {
                    tsConfigFile: this.options.typescript.tsConfigFile,
                    typeCheck: false,
                    emitErrors: false,
                });
            }
        }
        if (this.options.react) {
            this.requireNpmPackage('react');
            this.requireNpmPackage('react-dom');
            if (this._config.resolve.extensions.indexOf('.jsx') < 0)
                this._config.resolve.extensions.push('.jsx');
            if (this.options.react.hotReload) {
                this.requireNpmPackage('react-hot-loader');
                if (this.options.typescript)
                    this.requireNpmPackage('@types/react-hot-loader');
            }
            if (!this.testExtension('jsx')) {
                this.addRule('jsx')
                    .addReactHotLoader()
                    .addBabelLoader();
            }
            else {
                console.warn('Rule for .jsx already registerd - skipping');
            }
            if (this.options.typescript) {
                this.requireNpmPackage('@types/react');
                this.requireNpmPackage('@types/react-dom');
                if (this._config.resolve.extensions.indexOf('.tsx') < 0)
                    this._config.resolve.extensions.push('.tsx');
                if (!this.testExtension('tsx')) {
                    this.addRule('tsx')
                        .exclude(/node_modules/)
                        .addLoader('ts-loader')
                        .addReactHotLoader()
                        .addBabelLoader();
                }
                else {
                    console.warn('Rule for .tsx already registerd - skipping');
                }
                if (this.options.typescript.tslint) {
                    this.addRule('tsx', 'pre')
                        .addLoader('tslint-loader', {
                        tsConfigFile: this.options.typescript.tsConfigFile,
                        typeCheck: false,
                        emitErrors: false,
                    });
                }
            }
        }
        if (this.options.css) {
            this.requireNpmPackage('css-loader');
            this.requireNpmPackage('style-loader');
            if (!this.testExtension('css')) {
                this.addRule('css')
                    .addLoader('css-loader')
                    .addLoader('style-loader', { sourceMap: this.options.css.sourceMaps });
            }
            if (this.options.css.scss) {
                this.requireNpmPackage('sass-loader');
                // this.requireNpmPackage('node-sass'); // Already required as peer-dependency of sass-loader
                if (!this.testExtension('scss')) {
                    this.addRule('scss')
                        .addLoader('sass-loader')
                        .addLoader('css-loader', { sourceMap: this.options.css.sourceMaps })
                        .addLoader('style-loader', { sourceMap: this.options.css.sourceMaps });
                }
            }
        }
        if (this.options.html) {
            this.requireNpmPackage('html-loader');
            if (this.testExtension('html'))
                throw new Error('html options specified but already registered rules for html files');
            switch (this.options.html) {
                case 'angular':
                    this.requireNpmPackage('ngtemplate-loader');
                    this.addRule('html')
                        .addLoader('html-loader')
                        .addLoader('ngtemplate-loader') // , { relativeTo: '/src/' }) // TODO: What is relativeTo and what should it be?
                        .addLoader('webpack-module-hot-accept');
                    break;
                case 'resource':
                    this.addRule('html')
                        .addLoader('html-loader');
                    break;
            }
        }
        if (this.options.json) {
            this.requireNpmPackage('json-loader');
            if (!this.testExtension('json')) {
                this.addRule('json')
                    .addLoader('json-loader');
            }
            else {
                console.warn('Rule for .json already registerd - skipping');
            }
        }
        if (this.options.resources.urlLoad) {
            this.requireNpmPackage('url-loader');
            let unmatchedExtensions = this.options.resources.urlLoad.extensions
                .filter(x => !this.testExtension(x));
            if (unmatchedExtensions.length > 0) {
                this.addRule(unmatchedExtensions)
                    .addLoader('url-loader', {
                    limit: this.options.resources.urlLoad.limit,
                    name: '[path][name].[hash].[ext]',
                });
            }
        }
        if (this.options.resources.extensions) {
            this.requireNpmPackage('file-loader');
            let unmatchedExtensions = this.options.resources.extensions
                .filter(x => !this.testExtension(x));
            if (unmatchedExtensions.length > 0) {
                this.addRule(unmatchedExtensions)
                    .addLoader('file-loader', {
                    name: '[path][name].[hash].[ext]',
                });
            }
        }
        return this._config;
    }
    get config() {
        if (!this._built)
            return this.build();
        return this._config;
    }
}
exports.WebpackConfigurationBuilder = WebpackConfigurationBuilder;
class WebpackRuleBuilder {
    constructor(options, test, enforce) {
        this.options = options;
        this.rule = {
            test: test,
            enforce: enforce,
            use: [],
        };
    }
    exclude(exclude) {
        if (!this.rule.exclude)
            this.rule.exclude = [];
        this.rule.exclude.push(exclude);
        return this;
    }
    addLoader(loader, options) {
        this.rule.use.unshift({
            loader: loader,
            options: options,
        });
        return this;
    }
    /**
     * Adds 'react-hot-loader/webpack' if react hot loading enabled and no babel is used
     */
    addReactHotLoader() {
        if (this.options.react && this.options.react.hotReload && !this.options.babel)
            this.addLoader('react-hot-loader/webpack');
        return this;
    }
    /**
     * Adds 'babel-loader' if babel is enabled
     */
    addBabelLoader() {
        if (!this.options.babel)
            return this;
        this.addLoader('babel-loader', {
            // This is a feature of `babel-loader` for webpack (not Babel itself).
            // It enables caching results in ./node_modules/.cache/babel-loader/ directory for faster rebuilds.
            cacheDirectory: true,
            presets: this.options.babel.presets,
        });
        return this;
    }
}
exports.WebpackRuleBuilder = WebpackRuleBuilder;
