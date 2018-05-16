"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const _ = require("lodash");
const mockRequire = require("mock-require");
const webpack = require("webpack");
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
function makeObject(val) {
    if (!val)
        return false;
    if (typeof val !== 'object')
        return {};
    return val;
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
                // Add 'src' to our modulesDirectories, as all our app code will live in there, so Webpack should look in there for modules
                // modules: ['node_modules', 'src'],
                alias: {},
                plugins: [],
            },
            devtool: false,
            devServer: {
                contentBase: undefined,
                historyApiFallback: true,
                compress: true,
                // port: PORT,
                lazy: false,
                hot: false,
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
        this._requiredPackages = {};
        this._missingPackages = {};
        this.options = _.cloneDeep(options);
        if (this.env) {
            if (this.options.env[this.env]) {
                _.mergeWith(this.options, this.options.env[this.env], mergeWithArrayConcat);
            }
            else if (this.env !== 'dev') {
                console.warn(`Environment ${this.env} set but not configured`);
            }
        }
        this.options.css = makeObject(this.options.css);
        this.options.output = makeObject(this.options.output);
        this.options.defines = makeObject(this.options.defines);
        this.options.resources = makeObject(this.options.resources);
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
        if (this.options.typescript) {
            if (this.options.typescript.useTsconfigPaths !== undefined)
                this.options.typescript.useTsconfigPaths = true;
        }
        let pkgJson = fs.readFileSync('./package.json', 'UTF-8');
        if (pkgJson) {
            this.packageJson = JSON.parse(pkgJson);
            this.packageJsonHash = crypto.createHash('md5').update(pkgJson).digest('hex');
        }
    }
    addDefine(name, value) {
        if (!this.options.defines)
            this.options.defines = {};
        this.options.defines[name] = JSON.stringify(value);
    }
    requireExtension(requireName, dependencyName) {
        if (!dependencyName)
            dependencyName = requireName;
        this._requiredPackages[dependencyName] = true;
        if (dependencyName.startsWith('@types/'))
            return; // Skip typescript typings
        try {
            return require(requireName);
        }
        catch (error) {
            if (error instanceof Error && error.message.indexOf(`Cannot find module '${dependencyName}`) >= 0) {
                this._missingPackages[dependencyName] = true;
                return;
            }
            throw error;
        }
    }
    requirePackage(requireName, dependencyName) {
        this.requireExtension(requireName, dependencyName);
    }
    get requiredPackages() {
        return Object.keys(this._requiredPackages).sort();
    }
    get missingPackages() {
        return Object.keys(this._missingPackages).sort();
    }
    addRule(test, enforce, checkIfExists = true) {
        let extensions = typeof test === 'string' ? [test] : test;
        let builder = new WebpackRuleBuilder(this.options, this, this.extensionsRegExp(extensions), enforce);
        if (enforce || !checkIfExists || !extensions.find(x => this.testExtension(x))) {
            this._config.module.rules.push(builder.rule);
        }
        else if (checkIfExists) {
            console.warn(`Rule for .${extensions.map(x => '.' + x).join(', ')} already registerd - skipping`);
        }
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
    addPlugin(plugin) {
        this._config.plugins.push(plugin);
    }
    addEntry(key, file, options = {}) {
        if (this._config.entry[key])
            throw new Error(`Duplicate webpack entry with key ${key}`);
        if (!(file instanceof Array))
            file = [file];
        if (options.babelPolyfill && this.options.babel)
            file.unshift('babel-polyfill');
        this._config.entry[key] = file;
    }
    build() {
        if (this._built)
            throw new Error('build() must only be called once!');
        this._built = true;
        Object.assign(this._config.devServer, this.options.devServer);
        if (this.options.clean) {
            const CleanWebpackPlugin = this.requireExtension('clean-webpack-plugin');
            if (CleanWebpackPlugin) {
                this.addPlugin(new CleanWebpackPlugin(path.resolve(this.outDir, '**'), {
                    exclude: this.options.clean.exclude,
                }));
            }
        }
        if (this.options.namedModules) {
            this.addPlugin(new webpack.NamedModulesPlugin());
        }
        if (this.options.hotReload) {
            this._config.devServer.hot = true;
            this.addPlugin(new webpack.HotModuleReplacementPlugin());
        }
        if (this.options.resources.copyFiles) {
            const CopyWebpackPlugin = this.requireExtension('copy-webpack-plugin');
            if (CopyWebpackPlugin) {
                this.addPlugin(new CopyWebpackPlugin(this.options.resources.copyFiles.patterns, {
                    ignore: this.options.resources.copyFiles.ignore,
                }));
            }
        }
        if (this.options.bundleSizeAnalyzer) {
            const WebpackBundleSizeAnalyzerPlugin = this.requireExtension('webpack-bundle-size-analyzer').WebpackBundleSizeAnalyzerPlugin;
            if (WebpackBundleSizeAnalyzerPlugin) {
                this.addPlugin(new WebpackBundleSizeAnalyzerPlugin(this.options.bundleSizeAnalyzer.outputFile || path.resolve(__dirname, 'webpack-bundle-size-report-main.txt')));
            }
        }
        if (this.options.uglify) {
            this.addPlugin(new webpack.optimize.UglifyJsPlugin({
                sourceMap: this.options.uglify.sourceMap,
                parallel: true,
                cache: true,
            }));
        }
        if (this.options.cacheLoader)
            this.requirePackage('cache-loader');
        if (this.options.nodeEnv !== undefined)
            this.addDefine('process.env.NODE_ENV', this.options.nodeEnv);
        this.addDefine('WEBPACK_HOT', !!this.options.hotReload);
        this.addPlugin(new webpack.DefinePlugin(this.options.defines));
        // if (this.isDebug) {
        //     this.addPlugin(new webpack.LoaderOptionsPlugin({ debug: true }));
        // }
        this._config.devtool = this.options.devtool;
        this._config.devServer.contentBase = this.outDir;
        this._config.output.path = this.outDir;
        this._config.output.filename = this.options.output.filename || '[name].[hash].js';
        this._config.output.publicPath = this.options.output.publicPath;
        if (this.options.babel) {
            if (!this.options.babel.plugins)
                this.options.babel.plugins = [];
            if (this.options.react && this.options.react.hotReload && this.options.babel.plugins.indexOf('react-hot-loader/babel') < 0)
                this.options.babel.plugins.push('react-hot-loader/babel');
            this.requirePackage('babel-loader', 'babel-loader@^8.0.0-beta');
            this.requirePackage('@babel/core');
            this.requirePackage('@babel/polyfill');
            this.requirePackage('@babel/preset-env');
            if (this.options.react)
                this.requirePackage('@babel/preset-react');
            this.addRule('js')
                .exclude(/node_modules/)
                .addBabelLoader()
                .addUglifyLoader();
        }
        if (this.options.typescript) {
            this.requirePackage('typescript');
            this.requirePackage('ts-loader');
            if (this._config.resolve.extensions.indexOf('.ts') < 0)
                this._config.resolve.extensions.push('.ts');
            this.addRule('ts')
                .exclude(/node_modules/)
                .addTsLoader()
                .addBabelLoader()
                .addUglifyLoader()
                .addCacheLoader('ts');
            let tsLintJson;
            if (this.options.typescript.tslint) {
                tsLintJson = this.options.typescript.tslint.tslintJson;
                if (!tsLintJson || !fs.existsSync(tsLintJson)) {
                    tsLintJson = path.resolve('tslint.json');
                    if (!fs.existsSync(tsLintJson))
                        tsLintJson = path.resolve(path.dirname(this.options.typescript.tsConfigFile), 'tslint.json');
                    if (!fs.existsSync(tsLintJson))
                        tsLintJson = undefined;
                }
            }
            if (this.options.typescript.useForkTsChecker) {
                if (tsLintJson)
                    this.options.typescript.tslint = false; // disable tslint because ForkTsCheckerWebpackPlugin already does it
                const ForkTsCheckerWebpackPlugin = this.requireExtension('fork-ts-checker-webpack-plugin');
                if (ForkTsCheckerWebpackPlugin) {
                    this._config.plugins.push(new ForkTsCheckerWebpackPlugin({
                        tsconfig: this.options.typescript.tsConfigFile,
                        tslint: tsLintJson,
                        workers: Math.min(2, ForkTsCheckerWebpackPlugin.TWO_CPUS_FREE),
                        async: false,
                    }));
                }
            }
            if (this.options.typescript.tslint) {
                this.requirePackage('tslint');
                this.requirePackage('tslint-loader');
                this.addRule('ts', 'pre')
                    .addLoader('tslint-loader', {
                    tsConfigFile: this.options.typescript.tsConfigFile,
                    configFile: tsLintJson,
                    typeCheck: this.options.typescript.tslint.typeCheck,
                    emitErrors: this.options.typescript.tslint.emitErrors,
                });
            }
            if (this.options.typescript.useTsconfigPaths) {
                const TsconfigPathsPlugin = this.requireExtension('tsconfig-paths-webpack-plugin');
                if (TsconfigPathsPlugin) {
                    this._config.resolve.plugins.push(new TsconfigPathsPlugin({
                        configFile: this.options.typescript.tsConfigFile,
                    }));
                }
            }
        }
        if (this.options.react) {
            this.requirePackage('react');
            this.requirePackage('react-dom');
            if (this.options.react.hotReload) {
                if (!this.options.babel)
                    throw new Error('react-hot-loader requires babel');
                this.requirePackage('react-hot-loader');
                if (this.options.typescript)
                    this.requirePackage('@types/react-hot-loader');
            }
            if (this._config.resolve.extensions.indexOf('.jsx') < 0)
                this._config.resolve.extensions.push('.jsx');
            this.addRule('jsx')
                .addBabelLoader()
                .addUglifyLoader()
                .addCacheLoader('jsx');
            if (this.options.typescript) {
                this.requirePackage('@types/react');
                this.requirePackage('@types/react-dom');
                if (this._config.resolve.extensions.indexOf('.tsx') < 0)
                    this._config.resolve.extensions.push('.tsx');
                this.addRule('tsx')
                    .exclude(/node_modules/)
                    .addTsLoader()
                    .addBabelLoader()
                    .addUglifyLoader()
                    .addCacheLoader('tsx');
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
            this.requirePackage('css-loader');
            this.requirePackage('style-loader');
            this.addRule('css')
                .addLoader('css-loader')
                .addLoader('style-loader', { sourceMap: this.options.css.sourceMaps });
            if (this.options.css.scss) {
                this.requirePackage('sass-loader');
                // this.requirePackage('node-sass'); // Already required as peer-dependency of sass-loader
                this.addRule('scss')
                    .addLoader('sass-loader')
                    .addLoader('css-loader', { sourceMap: this.options.css.sourceMaps })
                    .addLoader('style-loader', { sourceMap: this.options.css.sourceMaps })
                    .addCacheLoader('scss');
            }
        }
        if (this.options.html) {
            this.requirePackage('html-loader');
            switch (this.options.html) {
                case 'angular':
                    this.requirePackage('ngtemplate-loader');
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
            this.requirePackage('json-loader');
            this.addRule('json')
                .addLoader('json-loader');
        }
        if (this.options.resources.urlLoad) {
            this.requirePackage('url-loader');
            let unmatchedExtensions = this.options.resources.urlLoad.extensions
                .filter(x => !this.testExtension(x));
            if (unmatchedExtensions.length > 0) {
                this.addRule(unmatchedExtensions, undefined, false)
                    .addLoader('url-loader', {
                    limit: this.options.resources.urlLoad.limit,
                    name: '[path][name].[hash].[ext]',
                });
            }
        }
        if (this.options.resources.extensions) {
            this.requirePackage('file-loader');
            let unmatchedExtensions = this.options.resources.extensions
                .filter(x => !this.testExtension(x));
            if (unmatchedExtensions.length > 0) {
                this.addRule(unmatchedExtensions, undefined, false)
                    .addLoader('file-loader', {
                    name: '[path][name].[hash].[ext]',
                });
            }
        }
        if (this.missingPackages.length > 0) {
            let missingPackages = this.missingPackages.join(' ');
            throw new Error(`Missing webpack packages detected. Please install the following packages:
==> npm install --save-dev ${missingPackages}
==> yarn add -D ${missingPackages}
`);
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
    constructor(options, builder, test, enforce) {
        this.options = options;
        this.builder = builder;
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
     * If enabled, adds a cache-loader to speed up builds
     */
    addCacheLoader(extension) {
        if (WebpackRuleBuilder.cacheLoaderFailed || !this.options.cacheLoader || extension && this.options.cacheLoader[extension] === false)
            return this;
        if (!this.builder.packageJsonHash) {
            console.error('Could not add cache-loader. package.json hash string missing. Probably could not find package.json file');
            WebpackRuleBuilder.cacheLoaderFailed = true;
            return;
        }
        this.addLoader('cache-loader', { cacheIdentifier: `cache-loader:${this.builder.packageJsonHash} ${this.builder.env}` });
        return this;
    }
    /**
     * Adds 'ts-loader' with correct settings
     */
    addTsLoader() {
        if (!this.options.typescript)
            throw new Error('Tried to add TS loader without typescript settings configured');
        this.addLoader('ts-loader', {
            transpileOnly: this.options.typescript.useForkTsChecker,
        });
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
            plugins: this.options.babel.plugins,
        });
        return this;
    }
    /**
     * Adds 'uglify-loader' if enabled
     */
    addUglifyLoader() {
        if (!this.options.uglifyLoader)
            return this;
        this.addLoader('uglify-loader', {
            sourceMap: this.options.uglifyLoader.sourceMap,
            mangle: false,
        });
        return this;
    }
}
WebpackRuleBuilder.cacheLoaderFailed = false;
exports.WebpackRuleBuilder = WebpackRuleBuilder;
