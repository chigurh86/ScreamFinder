// Compatibility shim for both `babel-plugin-syntax-hermes-parser` AND
// the `hermes-parser` package.
//
// -----------------------------------------------------------------------------
// Background
// -----------------------------------------------------------------------------
// React Native 0.79+ ships internal source files (e.g.
//   react-native/src/private/webapis/performance/Performance.js
// ) that use Flow syntax. Those files are normally parsed by
// `hermes-parser` (via `babel-plugin-syntax-hermes-parser`), which swaps
// Babel's parser out for hermes-parser to handle the full Hermes-flavored
// Flow syntax.
//
// On this project, the tooling redirects every require of the
// `babel-plugin-syntax-hermes-parser` package AND the `hermes-parser`
// package to this single stub file. That means both the Babel plugin
// call sites AND @expo/metro-config's transformSync (which destructures
// `parseWithBabel` off of the hermes-parser module) end up loading
// whatever this file exports.
//
// If we only export the plugin factory, @expo/metro-config's
// `transformSync` explodes with:
//   ReferenceError: parseWithBabel is not defined
// because it destructured `parseWithBabel` off the require result and
// got `undefined`.
//
// If we only export parser functions, `babel-plugin-syntax-hermes-parser`
// call sites (which expect a Babel plugin factory) explode with:
//   TypeError: plugin is not a function
//
// -----------------------------------------------------------------------------
// Fix
// -----------------------------------------------------------------------------
// Export a Babel plugin factory as the default `module.exports`, AND attach
// the hermes-parser API surface (`parse`, `parseWithBabel`, and a few
// helpers) as named properties on that same function object. Functions
// in JS can carry properties, so destructuring
//   const { parseWithBabel } = require('hermes-parser')
// works, and calling
//   const plugin = require('babel-plugin-syntax-hermes-parser').default
// (or the whole module) also works.
//
// The parser functions delegate to the standard `@babel/parser` with Flow
// enabled — this lets RN's internal Flow-typed source files parse cleanly
// without pulling in the real hermes-parser runtime (which itself fails
// to bundle on web).

// ---------------------------------------------------------------------------
// Parser API — mimics hermes-parser
// ---------------------------------------------------------------------------

/**
 * Parse `code` using @babel/parser with Flow syntax enabled. Returns a
 * Babel-compatible AST. Mirrors hermes-parser's `parseWithBabel` signature
 * closely enough for @expo/metro-config's transformSync to consume it.
 */
function parseWithBabel(code, options) {
  const parser = require('@babel/parser');
  const opts = options || {};
  const babelOptions = opts.babel || {};
  const providedPlugins = Array.isArray(babelOptions.plugins)
    ? babelOptions.plugins.slice()
    : [];

  // Only enable Flow when the file is NOT already being parsed as
  // TypeScript — the two parser plugins are mutually exclusive.
  const hasTypeScript = providedPlugins.some(
    (p) =>
      p === 'typescript' ||
      (Array.isArray(p) && p[0] === 'typescript'),
  );

  const plugins = providedPlugins;
  if (!hasTypeScript) {
    if (
      !plugins.some(
        (p) => p === 'flow' || (Array.isArray(p) && p[0] === 'flow'),
      )
    ) {
      plugins.push('flow');
    }
    if (
      !plugins.some(
        (p) =>
          p === 'flowComments' ||
          (Array.isArray(p) && p[0] === 'flowComments'),
      )
    ) {
      plugins.push('flowComments');
    }
  }
  if (
    !plugins.some(
      (p) => p === 'jsx' || (Array.isArray(p) && p[0] === 'jsx'),
    )
  ) {
    plugins.push('jsx');
  }

  const sourceType =
    opts.sourceType || babelOptions.sourceType || 'module';

  return parser.parse(code, {
    sourceType,
    sourceFilename: opts.sourceFilename || babelOptions.sourceFilename,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowUndeclaredExports: true,
    allowAwaitOutsideFunction: true,
    tokens: !!(opts.tokens || babelOptions.tokens),
    ...babelOptions,
    plugins,
  });
}

/**
 * hermes-parser's `parse` returns an object with `ast`, `tokens`, and
 * `errors`. Our stub returns the same shape by wrapping @babel/parser.
 */
function parse(code, options) {
  const ast = parseWithBabel(code, options);
  return { ast: ast, tokens: [], errors: [] };
}

// hermes-parser exposes a handful of AST utilities that some tooling
// destructures at module load time. Providing no-op implementations
// keeps those `const { foo } = require('hermes-parser')` calls from
// throwing while the tool never actually invokes them at runtime.
function mutateESTreeASTForPrettier() {
  return null;
}
const SimpleTraverser = {
  traverse: function traverse() {},
};
const SimpleTransform = {
  transform: function transform(node) {
    return node;
  },
};

// ---------------------------------------------------------------------------
// Babel plugin factory — mimics babel-plugin-syntax-hermes-parser
// ---------------------------------------------------------------------------

/**
 * Real Babel plugin — pushes the standard `flow` parser plugin onto the
 * parser options so RN's Flow-typed internal source files (Performance.js,
 * etc.) parse cleanly under the stock `@babel/parser`.
 */
function hermesParserFlowShim() {
  return {
    name: 'hermes-parser-flow-shim',
    manipulateOptions: function manipulateOptions(_opts, parserOpts) {
      if (!parserOpts) return;
      if (!Array.isArray(parserOpts.plugins)) {
        parserOpts.plugins = [];
      }
      // Skip if TypeScript is already active — Flow + TypeScript can't
      // both be enabled in @babel/parser at the same time.
      const hasTypeScript = parserOpts.plugins.some(
        (p) =>
          p === 'typescript' ||
          (Array.isArray(p) && p[0] === 'typescript'),
      );
      if (hasTypeScript) return;

      const hasFlow = parserOpts.plugins.some(
        (p) => p === 'flow' || (Array.isArray(p) && p[0] === 'flow'),
      );
      if (!hasFlow) parserOpts.plugins.push('flow');

      const hasFlowComments = parserOpts.plugins.some(
        (p) =>
          p === 'flowComments' ||
          (Array.isArray(p) && p[0] === 'flowComments'),
      );
      if (!hasFlowComments) parserOpts.plugins.push('flowComments');
    },
    visitor: {},
  };
}

// ---------------------------------------------------------------------------
// Module exports — serve both use cases
// ---------------------------------------------------------------------------

// Default export is the Babel plugin factory. Consumers that do
// `require('babel-plugin-syntax-hermes-parser')` (or `.default`) get a
// working Babel plugin.
module.exports = hermesParserFlowShim;
module.exports.default = hermesParserFlowShim;

// Attach the hermes-parser API surface as named properties on the same
// export. Consumers that do
//   const { parseWithBabel } = require('hermes-parser')
// pick these up successfully.
module.exports.parse = parse;
module.exports.parseWithBabel = parseWithBabel;
module.exports.mutateESTreeASTForPrettier = mutateESTreeASTForPrettier;
module.exports.SimpleTraverser = SimpleTraverser;
module.exports.SimpleTransform = SimpleTransform;
