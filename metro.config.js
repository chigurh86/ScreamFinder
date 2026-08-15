// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// -----------------------------------------------------------------------------
// Web-only shim for expo-image
// -----------------------------------------------------------------------------
// expo-image@2.2.1's `src/web/ImageRef.ts` extends a SharedRef class that
// resolves to `undefined` at web bundle time on this Expo SDK / metro
// version combo, producing:
//   "Class extends value undefined is not a constructor or null"
//
// Native builds (iOS/Android) work fine. So we intercept the module resolver
// for the `web` platform only and redirect `expo-image` to a local wrapper
// around React Native's Image component. iOS and Android continue to use the
// real expo-image module for full performance and caching.
// -----------------------------------------------------------------------------
const expoImageWebShimPath = path.resolve(
  __dirname,
  'services/expoImageWebShim.tsx',
);

// -----------------------------------------------------------------------------
// Native bundle fix — stub react-native/src/private/webapis/performance/Performance.js
// -----------------------------------------------------------------------------
// RN 0.79.3 ships that internal file with Flow-typed, multi-line `import`
// statements that hermes-parser@0.25.1 (invoked by @expo/metro-config's
// transformSync) cannot parse, causing:
//   SyntaxError: '{' expected in import specifier clause (19:7)
//   import
//          ^
// The bundle aborts before it starts, so the app fails to load on
// iOS/Android.
//
// Nothing in this app uses the internal Performance class directly — it's
// only imported by RN's own core setup. We redirect any Metro resolution
// of this specific file to a plain-JS stub that exposes the same public
// API surface, so the bundle succeeds and any consumers get a no-op
// equivalent at runtime.
// -----------------------------------------------------------------------------
const rnPerformanceStubPath = path.resolve(
  __dirname,
  'stubs/rn-performance-stub.js',
);
const RN_PERFORMANCE_FILE_RE =
  /[\\/]react-native[\\/]src[\\/]private[\\/]webapis[\\/]performance[\\/]Performance\.js$/;

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1) Web-only expo-image shim (native uses the real expo-image).
  if (platform === 'web' && moduleName === 'expo-image') {
    return {
      filePath: expoImageWebShimPath,
      type: 'sourceFile',
    };
  }

  // 2) Let Metro (or an upstream custom resolver) do the actual resolution.
  let resolved;
  try {
    resolved =
      typeof originalResolveRequest === 'function'
        ? originalResolveRequest(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    // Preserve original failure semantics — do not silently swallow.
    throw err;
  }

  // 3) After resolution, redirect any resolution that points at RN's
  //    internal Performance.js (which hermes-parser can't parse) to our
  //    stub. Any platform (ios/android/web) benefits equally.
  if (
    resolved &&
    typeof resolved.filePath === 'string' &&
    RN_PERFORMANCE_FILE_RE.test(resolved.filePath)
  ) {
    return {
      filePath: rnPerformanceStubPath,
      type: 'sourceFile',
    };
  }

  return resolved;
};

module.exports = config;
