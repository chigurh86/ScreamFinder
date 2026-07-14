// Compatibility shim for `babel-plugin-syntax-hermes-parser`.
//
// -----------------------------------------------------------------------------
// Background
// -----------------------------------------------------------------------------
// React Native 0.79+ ships internal source files (e.g.
//   react-native/src/private/webapis/performance/Performance.js
// ) that use Flow syntax including inline type imports, type spread,
// `import typeof`, etc. Those files are normally parsed by
// `babel-plugin-syntax-hermes-parser`, which swaps Babel's parser out for
// hermes-parser to correctly handle the full Hermes-flavored Flow syntax.
//
// On this project, `hermes-parser` (via its plugin's dist/index.js)
// hard-codes an absolute-path require to this stub file. That means every
// Babel transform that would load `babel-plugin-syntax-hermes-parser`
// ends up executing whatever we export here. If we return a pure no-op
// (as an earlier version of this file did), the parser gets no Flow
// support and RN's Flow-typed internal source files fail with:
//   "SyntaxError: Unexpected token, expected "{" ..."
// during the iOS/Android bundling step, breaking the app entirely.
//
// -----------------------------------------------------------------------------
// Fix
// -----------------------------------------------------------------------------
// Instead of a no-op, return a real Babel plugin whose `manipulateOptions`
// hook pushes the standard `flow` parser plugin onto the parser options
// list. This tells `@babel/parser` to accept Flow syntax when transforming
// files that would otherwise be handed off to hermes-parser. The result
// is that RN's internal Flow-typed source files parse cleanly under the
// stock `@babel/parser`, and both iOS and web bundles complete
// successfully — without pulling in the hermes-parser runtime (which
// itself fails to bundle on web).

module.exports = function hermesParserFlowShim() {
  return {
    name: 'hermes-parser-flow-shim',
    // Enable Flow syntax at the parser level for any file that would
    // normally be handled by hermes-parser. Idempotent — safe to call
    // repeatedly across files.
    manipulateOptions(_opts, parserOpts) {
      if (!parserOpts || !Array.isArray(parserOpts.plugins)) return;
      const hasFlow = parserOpts.plugins.some(
        (p) =>
          p === 'flow' ||
          (Array.isArray(p) && p[0] === 'flow'),
      );
      if (!hasFlow) {
        parserOpts.plugins.push('flow');
      }
      // `flowComments` lets Babel understand `/*::` and `/*:` comment
      // annotations that appear in some RN internal files.
      const hasFlowComments = parserOpts.plugins.some(
        (p) =>
          p === 'flowComments' ||
          (Array.isArray(p) && p[0] === 'flowComments'),
      );
      if (!hasFlowComments) {
        parserOpts.plugins.push('flowComments');
      }
    },
    // Provide an empty visitor object so Babel is happy to treat this as
    // a legitimate plugin.
    visitor: {},
  };
};

// Some consumers (including the real hermes-parser plugin's dist/index.js)
// destructure the default export off of `require(...)`. Mirror the plugin
// factory onto `.default` so both `require(...)` and
// `require(...).default` resolve to the same shim.
module.exports.default = module.exports;
