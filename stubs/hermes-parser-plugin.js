// No-op stub for babel-plugin-syntax-hermes-parser.
//
// The plugin's dist/index.js hardcodes a require to this absolute path.
// When this file is missing, web builds fail with:
//   "Cannot find module '/tmp/projects/project1/stubs/hermes-parser-plugin.js'"
//
// We don't need Hermes-syntax parsing for our TypeScript source, so this
// stub returns a valid but empty babel plugin that satisfies the require
// while performing no transformations. Native builds (Metro / iOS /
// Android) are unaffected because they take a different code path that
// never hits this stub.
module.exports = function hermesParserNoop() {
  return {
    name: 'hermes-parser-noop',
    visitor: {},
  };
};

// Some consumers may pull the plugin factory off the default export.
module.exports.default = module.exports;
