import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

import * as _ from 'lodash';
import * as mockRequire from 'mock-require';

import * as webpack from 'webpack';
import * as TYPES_CleanWebpackPlugin from 'clean-webpack-plugin';
import * as TYPES_CopyWebpackPlugin from 'copy-webpack-plugin';
// import * as TYPES_HtmlWebpackPlugin from 'html-webpack-plugin';
// import * as TYPES_TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'; // Has no typings yet
// import * as TYPES_ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin'; // Has no typings yet

declare global {
    interface NodeModule {
        hot?: {
            accept(fn: string, cb: () => void): void;
        };
    }
    const WEBPACK_HOT: boolean;
}

mockRequire('webpack-module-hot-accept', function(this: webpack.loader.LoaderContext, source: string, map: any) {
    if (!/\bmodule.hot\b/.test(source)) {
        source = source + `
if (module.hot) {
    module.hot.accept(function(err) {
        if (err) console.error(err);
    });
}
`;
    }
    if (this.cacheable) this.cacheable();
    let callback = this.async();
    if (callback)
        return callback(undefined, source, map);
    return source;
});

export interface CopyPattern {
    /** File source path or glob */
    from: string;
	/**
	 * Path or webpack file-loader patterns. defaults:
	 * output root if `from` is file or dir.
	 * resolved glob path if `from` is glob.
	 */
    to?: string;
	/**
	 * How to interpret `to`. defaults:
	 * 'file' if to has extension or from is file.
	 * 'dir' if from is directory, to has no extension or ends in '/'.
	 * 'template' if to contains a template pattern.
	 */
    toType?: 'file' | 'dir' | 'template';
    /** A path that determines how to interpret the `from` path. (default: `compiler.options.context`) */
    context?: string;
	/**
	 * Removes all directory references and only copies file names.
	 * 
	 * If files have the same name, the result is non-deterministic. (default: `false`)
	 */
    flatten?: boolean;
    /** Additional globs to ignore for this pattern. (default: `[]`) */
    ignore?: Array<string>;
    /** Function that modifies file contents before writing to webpack. (default: `(content, path) => content`) */
    transform?: (content: string, path: string) => string;
    /** Overwrites files already in `compilation.assets` (usually added by other plugins; default: `false`) */
    force?: boolean;
}

export interface WebpackResolve extends webpack.Resolve {
    extensions: string[];
    alias: {};
    plugins: webpack.ResolvePlugin[];
}

export interface WebpackConfiguration extends webpack.Configuration {
    entry: webpack.Entry;
    output: webpack.Output;
    resolve: WebpackResolve;
    module: webpack.NewModule;
    plugins: webpack.Plugin[];
}

export interface ResourceOptions {
    extensions?: string[];
    urlLoad?: {
        extensions: string[];
        limit: number;
    };
    copyFiles?: {
        patterns: CopyPattern[];
        ignore?: string[];
    };
}

export interface OutputOptions {
    /** default: '[name].[hash].js' */
    filename?: string;
    /** default: undefined */
    publicPath?: string;
}

export interface BaseOptions {
    /** default: 'cheap-module-source-map' */
    devtool?: webpack.Options.Devtool;
    output?: OutputOptions;
    /** 
     * default: false
     * Makes bundle use named modules instead of incremental numbers (useful for debugging)
     */
    namedModules?: boolean;
    /** 
     * default: false
     * Requires typescript npm package.
     */
    typescript?: false | {
        /** default: true */
        useTsconfigPaths?: boolean;
        /** default: false */
        useForkTsChecker?: boolean;
        tsConfigFile: string;
        tslint?: false | {
            typeCheck?: boolean;
            emitErrors?: boolean;
        };
    };
    /** 
     * default: false
     * Requires babel-loader, babel, ... npm packages.
     */
    babel?: false | {
        presets?: (string | (string | any)[])[];
        plugins?: string[];
    };
    /** default: false */
    react?: false | {
        /** 
          * default: true
          * Requires 'react-hot-loader' npm package.
          * Requires 'react-hot-loader/babel' plugin in babel presets.
          */
        hotReload?: boolean;
        hotReloadNext?: boolean;
    };
    /** default: true */
    hotReload?: boolean;
    nodeEnv?: string;
    bundleSizeAnalyzer?: false | {
        outputFile?: string;
    };
    uglify?: false | {
        /**
         * Also transform sourceMaps?
         * WARNING: Slow for larger projects!!
         * Also does not work for 'cheap-source-map' options
         * default: false
         */
        sourceMap?: boolean;
    };
    uglifyLoader?: false | {
        /**
         * Also transform sourceMaps?
         * default: false
         */
        sourceMap?: boolean;
    };
    cacheLoader?: false | {
        ts?: boolean;
        jsx?: boolean;
        tsx?: boolean;
        scss?: boolean;
        [extension: string]: boolean | undefined;
    };
    /** default: {} */
    css?: false | {
        /** default: false */
        scss?: boolean;
        /** default: false */
        sourceMaps?: boolean;
    };
    /** default: 'resource' */
    html?: false | 'resource' | 'angular';
    /** default: false */
    json?: boolean;
    /** default: false */
    clean?: false | {
        exclude?: string[],
    };
    defines?: Record<string, string>;
    resources?: ResourceOptions;
}

export interface Options extends BaseOptions {
    env: Record<string, BaseOptions>;
}

export interface RequiredOptions extends Options {
    resources: ResourceOptions;
    output: OutputOptions;
    defines: Record<string, string>;
}

export interface WebpackEntryOptions {
    /** default: true */
    react?: boolean;
    /** default: true */
    babelPolyfill?: boolean;
}

export type WebpackEnforceRule = 'pre' | 'post';

function mergeWithArrayConcat(objValue: any, srcValue: any) {
    if (objValue instanceof Array) {
        return objValue.concat(srcValue);
    }
}

function makeObject<T>(val: boolean | T) {
    if (!val)
        return false;
    if (typeof val !== 'object')
        return {};
    return val;
}

export class WebpackConfigurationBuilder {

    private _config: WebpackConfiguration = {
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
        plugins: [
        ],
        module: {
            rules: [],
        }
    };

    private _built = false;

    private packageJson: any;

    public readonly packageJsonHash: string;

    private readonly options: RequiredOptions;

    private readonly _requiredNpmPackages: Record<string, boolean> = {};

    constructor(
        public readonly outDir: string,
        public readonly env = 'dev',
        options: Options,
    ) {
        this.options = _.cloneDeep(options) as any;
        if (this.env) {
            if (this.options.env[this.env]) {
                _.mergeWith(this.options, this.options.env[this.env], mergeWithArrayConcat);
            } else if (this.env !== 'dev') {
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

    public addDefine(name: string, value: any) {
        if (!this.options.defines)
            this.options.defines = {};
        this.options.defines[name] = JSON.stringify(value);
    }

    private requireExtension<T>(importName: string, packageName?: string): T {
        if (!packageName)
            packageName = importName;
        this.requireNpmPackage(packageName);
        try {
            return require(importName);
        } catch (error) {
            if (error instanceof Error && error.message.indexOf(`Cannot find module '${packageName}`) >= 0)
                throw new Error(`You have to install npm package '${packageName}' before running webpack: npm install --save-dev ${packageName}`);
            throw error;
        }
    }

    public addRule(test: string | string[], enforce?: WebpackEnforceRule, checkIfExists = true) {
        let extensions = typeof test === 'string' ? [test] : test;
        let builder = new WebpackRuleBuilder(this.options, this, this.extensionsRegExp(extensions), enforce);
        if (!checkIfExists || !extensions.find(x => this.testExtension(x))) {
            this._config.module.rules.push(builder.rule);
        } else if (checkIfExists) {
            console.warn(`Rule for .${extensions.map(x => '.' + x).join(', ')} already registerd - skipping`);
        }
        return builder;
    }

    private testRule(name: string, enforce?: WebpackEnforceRule) {
        for (let rule of this._config.module.rules)
            if (rule.enforce === enforce && (rule.test as RegExp).test(name))
                return true;
        return false;
    }

    private testExtension(ext: string, enforce?: WebpackEnforceRule) {
        return this.testRule('test.' + ext, enforce);
    }

    private extensionsRegExp(ext: string[]) {
        if (ext.length === 0) throw new Error('requires at least one extension');
        return new RegExp(`.(${ext.join('|')})$`, 'i');
    }

    private extensionRegExp(...ext: string[]) {
        return this.extensionsRegExp(ext);
    }

    private requireNpmPackage(pkg: string, devOnly = true) {
        this._requiredNpmPackages[pkg] = devOnly;
    }

    public get requiredNpmPackages() {
        return Object.keys(this._requiredNpmPackages).sort();
    }

    public addPlugin(plugin: webpack.Plugin) {
        this._config.plugins.push(plugin);
    }

    public addEntry(key: string, file: string | string[], options: WebpackEntryOptions = {}) {
        if (this._config.entry[key])
            throw new Error(`Duplicate webpack entry with key ${key}`);
        if (!(file instanceof Array))
            file = [file];
        if (options.react !== false && this.options.hotReload && this.options.react && this.options.react.hotReload && !this.options.react.hotReloadNext) {
            file.unshift('react-hot-loader/patch');
        }
        if (options.babelPolyfill && this.options.babel)
            file.unshift('babel-polyfill');
        this._config.entry[key] = file;
    }

    public build(): webpack.Configuration {
        if (this._built) throw new Error('build() must only be called once!');
        this._built = true;

        if (this.options.clean) {
            const CleanWebpackPlugin = this.requireExtension<typeof TYPES_CleanWebpackPlugin>('clean-webpack-plugin');
            this.addPlugin(new CleanWebpackPlugin(path.resolve(this.outDir, '**'), {
                exclude: this.options.clean.exclude,
            }));
        }

        if (this.options.namedModules) {
            this.addPlugin(new webpack.NamedModulesPlugin());
        }

        if (this.options.hotReload) {
            this._config.devServer.hot = true;
            this.addPlugin(new webpack.HotModuleReplacementPlugin());
        }

        if (this.options.resources.copyFiles) {
            const CopyWebpackPlugin = this.requireExtension<typeof TYPES_CopyWebpackPlugin>('copy-webpack-plugin');
            this.addPlugin(new CopyWebpackPlugin(this.options.resources.copyFiles.patterns, {
                ignore: this.options.resources.copyFiles.ignore,
            }));
        }

        if (this.options.bundleSizeAnalyzer) {
            const WebpackBundleSizeAnalyzerPlugin = this.requireExtension<any>('webpack-bundle-size-analyzer').WebpackBundleSizeAnalyzerPlugin;
            this.addPlugin(new WebpackBundleSizeAnalyzerPlugin(
                this.options.bundleSizeAnalyzer.outputFile || path.resolve(__dirname, 'webpack-bundle-size-report-main.txt')
            ));
        }

        if (this.options.uglify) {
            this.addPlugin(new webpack.optimize.UglifyJsPlugin({
                sourceMap: this.options.uglify.sourceMap,
                parallel: true,
                cache: true, // undocumented in typings??
            } as webpack.optimize.UglifyJsPlugin.Options));
        }

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

            this.requireNpmPackage('babel-loader@8.0.0-beta.0');
            this.requireNpmPackage('@babel/core');
            this.requireNpmPackage('@babel/polyfill');
            this.requireNpmPackage('@babel/preset-env');
            if (this.options.react)
                this.requireNpmPackage('@babel/preset-react');
            this.addRule('js')
                .exclude(/node_modules/)
                .addBabelLoader()
                .addUglifyLoader();
        }

        if (this.options.typescript) {
            this.requireNpmPackage('typescript');
            this.requireNpmPackage('ts-loader');

            if (this._config.resolve.extensions.indexOf('.ts') < 0)
                this._config.resolve.extensions.push('.ts');
            this.addRule('ts')
                .exclude(/node_modules/)
                .addTsLoader()
                .addBabelLoader()
                .addUglifyLoader()
                .addCacheLoader('ts');

            if (this.options.typescript.tslint) {
                this.requireNpmPackage('tslint');
                this.requireNpmPackage('tslint-loader');
                this.addRule('ts', 'pre')
                    .addLoader('tslint-loader', {
                        tsConfigFile: this.options.typescript.tsConfigFile,
                        typeCheck: this.options.typescript.tslint.typeCheck,
                        emitErrors: this.options.typescript.tslint.emitErrors,
                    });
            }

            if (this.options.typescript.useTsconfigPaths) {
                const TsconfigPathsPlugin = this.requireExtension<any>('tsconfig-paths-webpack-plugin');
                this._config.resolve.plugins.push(new TsconfigPathsPlugin({
                    configFile: this.options.typescript.tsConfigFile,
                }));
            }

            if (this.options.typescript.useForkTsChecker) {
                const ForkTsCheckerWebpackPlugin = this.requireExtension<any>('fork-ts-checker-webpack-plugin');
                console.log(this.options.typescript.tsConfigFile);
                this._config.plugins.push(new ForkTsCheckerWebpackPlugin({
                    tsconfig: this.options.typescript.tsConfigFile,
                }));
            }
        }

        if (this.options.react) {
            this.requireNpmPackage('react');
            this.requireNpmPackage('react-dom');
            if (this.options.react.hotReload) {
                this.requireNpmPackage('react-hot-loader');
                if (this.options.typescript)
                    this.requireNpmPackage('@types/react-hot-loader');
            }

            if (this._config.resolve.extensions.indexOf('.jsx') < 0)
                this._config.resolve.extensions.push('.jsx');
            this.addRule('jsx')
                .addReactHotLoader()
                .addBabelLoader()
                .addUglifyLoader()
                .addCacheLoader('jsx');

            if (this.options.typescript) {
                this.requireNpmPackage('@types/react');
                this.requireNpmPackage('@types/react-dom');

                if (this._config.resolve.extensions.indexOf('.tsx') < 0)
                    this._config.resolve.extensions.push('.tsx');
                this.addRule('tsx')
                    .exclude(/node_modules/)
                    .addTsLoader()
                    .addReactHotLoader()
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
            this.requireNpmPackage('css-loader');
            this.requireNpmPackage('style-loader');

            this.addRule('css')
                .addLoader('css-loader')
                .addLoader('style-loader', { sourceMap: this.options.css.sourceMaps });

            if (this.options.css.scss) {
                this.requireNpmPackage('sass-loader');
                // this.requireNpmPackage('node-sass'); // Already required as peer-dependency of sass-loader

                this.addRule('scss')
                    .addLoader('sass-loader')
                    .addLoader('css-loader', { sourceMap: this.options.css.sourceMaps })
                    .addLoader('style-loader', { sourceMap: this.options.css.sourceMaps })
                    .addCacheLoader('scss');
            }
        }

        if (this.options.html) {
            this.requireNpmPackage('html-loader');
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
            this.addRule('json')
                .addLoader('json-loader');
        }

        if (this.options.resources.urlLoad) {
            this.requireNpmPackage('url-loader');
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
            this.requireNpmPackage('file-loader');
            let unmatchedExtensions = this.options.resources.extensions
                .filter(x => !this.testExtension(x));
            if (unmatchedExtensions.length > 0) {
                this.addRule(unmatchedExtensions, undefined, false)
                    .addLoader('file-loader', {
                        name: '[path][name].[hash].[ext]',
                    });
            }
        }

        return this._config;
    }

    public get config(): webpack.Configuration {
        if (!this._built)
            return this.build();
        return this._config;
    }

}

export class WebpackRuleBuilder {

    private static cacheLoaderFailed = false;

    public rule: webpack.BaseDirectRule & {
        use: webpack.Loader[];
    };

    constructor(private options: Options, private builder: WebpackConfigurationBuilder, test: RegExp, enforce?: WebpackEnforceRule) {
        this.rule = {
            test: test,
            enforce: enforce,
            use: [],
        };
    }

    public exclude(exclude: webpack.Condition) {
        if (!this.rule.exclude)
            this.rule.exclude = [];
        (this.rule.exclude as webpack.Condition[]).push(exclude);
        return this;
    }

    public addLoader(loader: string, options?: any) {
        this.rule.use.unshift({
            loader: loader,
            options: options,
        });
        return this;
    }

    /**
     * If enabled, adds a cache-loader to speed up builds
     */
    public addCacheLoader(extension?: string) {
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
    public addTsLoader() {
        if (!this.options.typescript)
            throw new Error('Tried to add TS loader without typescript settings configured');
        this.addLoader('ts-loader', {
            transpileOnly: this.options.typescript.useForkTsChecker,
        });
        return this;
    }

    /**
     * Adds 'react-hot-loader/webpack' if react hot loading enabled and no babel is used
     */
    public addReactHotLoader() {
        if (this.options.hotReload && this.options.react && this.options.react.hotReload && !this.options.babel)
            this.addLoader('react-hot-loader/webpack');
        return this;
    }

    /**
     * Adds 'babel-loader' if babel is enabled
     */
    public addBabelLoader() {
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
    public addUglifyLoader() {
        if (!this.options.uglifyLoader)
            return this;
        this.addLoader('uglify-loader', {
            sourceMap: this.options.uglifyLoader.sourceMap,
            mangle: false,
        });
        return this;
    }
}
