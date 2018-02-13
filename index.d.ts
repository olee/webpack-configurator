/// <reference types="webpack" />
import * as webpack from 'webpack';
declare global  {
    interface NodeModule {
        hot?: {
            accept(fn: string, cb: () => void): void;
        };
    }
    const WEBPACK_HOT: boolean;
}
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
            tslintJson?: string;
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
        exclude?: string[];
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
export declare type WebpackEnforceRule = 'pre' | 'post';
export declare class WebpackConfigurationBuilder {
    readonly outDir: string;
    readonly env: string;
    private _config;
    private _built;
    private packageJson;
    readonly packageJsonHash: string;
    private readonly options;
    private readonly _requiredNpmPackages;
    constructor(outDir: string, env: string, options: Options);
    addDefine(name: string, value: any): void;
    private requireExtension<T>(importName, packageName?);
    addRule(test: string | string[], enforce?: WebpackEnforceRule, checkIfExists?: boolean): WebpackRuleBuilder;
    private testRule(name, enforce?);
    private testExtension(ext, enforce?);
    private extensionsRegExp(ext);
    private extensionRegExp(...ext);
    private requireNpmPackage(pkg, devOnly?);
    readonly requiredNpmPackages: string[];
    addPlugin(plugin: webpack.Plugin): void;
    addEntry(key: string, file: string | string[], options?: WebpackEntryOptions): void;
    build(): webpack.Configuration;
    readonly config: webpack.Configuration;
}
export declare class WebpackRuleBuilder {
    private options;
    private builder;
    private static cacheLoaderFailed;
    rule: webpack.BaseDirectRule & {
        use: webpack.Loader[];
    };
    constructor(options: Options, builder: WebpackConfigurationBuilder, test: RegExp, enforce?: WebpackEnforceRule);
    exclude(exclude: webpack.Condition): this;
    addLoader(loader: string, options?: any): this;
    /**
     * If enabled, adds a cache-loader to speed up builds
     */
    addCacheLoader(extension?: string): this | undefined;
    /**
     * Adds 'ts-loader' with correct settings
     */
    addTsLoader(): this;
    /**
     * Adds 'react-hot-loader/webpack' if react hot loading enabled and no babel is used
     */
    addReactHotLoader(): this;
    /**
     * Adds 'babel-loader' if babel is enabled
     */
    addBabelLoader(): this;
    /**
     * Adds 'uglify-loader' if enabled
     */
    addUglifyLoader(): this;
}
