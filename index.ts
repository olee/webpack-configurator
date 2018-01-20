import * as path from 'path';

import * as _ from 'lodash';
import * as mockRequire from 'mock-require';

import * as webpack from 'webpack';
import * as CleanWebpackPlugin from 'clean-webpack-plugin';
import * as CopyWebpackPlugin from 'copy-webpack-plugin';
// import * as HtmlWebpackPlugin from 'html-webpack-plugin';

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
        tsConfigFile: string;
        tslint?: boolean;
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
    };
    /** default: true */
    hotReload?: boolean;
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
            // modulesDirectories: ['src', 'node_modules'],
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
        plugins: [
        ],
        module: {
            rules: [],
        }
    };

    private _built = false;

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

    public addRule(test: string | string[] | RegExp, enforce?: WebpackEnforceRule) {
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
        if (options.react !== false && this.options.hotReload && this.options.react && this.options.react.hotReload) {
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
            } else {
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
            } else {
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
            } else {
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
                } else {
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
            } else {
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

    public get config(): webpack.Configuration {
        if (!this._built)
            return this.build();
        return this._config;
    }

}

export class WebpackRuleBuilder {

    public rule: webpack.BaseDirectRule & {
        use: webpack.Loader[];
    };

    constructor(private options: Options, test: RegExp, enforce?: WebpackEnforceRule) {
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
     * Adds 'react-hot-loader/webpack' if react hot loading enabled and no babel is used
     */
    public addReactHotLoader() {
        if (this.options.react && this.options.react.hotReload && !this.options.babel)
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
        });
        return this;
    }
}
