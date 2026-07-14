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

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-image') {
    return {
      filePath: expoImageWebShimPath,
      type: 'sourceFile',
    };
  }
  if (typeof originalResolveRequest === 'function') {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
