// react-native.config.js
//
// BUILD 26 HARDENING: Block autolinking of native modules that
// ScreamFinder does not use but that were being pulled into the iOS
// binary as transitive dependencies. Apple's iPadOS 26.6 test device
// crashed Build 24 200ms after launch on
// `com.facebook.react.ExceptionsManagerQueue`, and the binary's Frameworks
// directory contained WebRTC.framework — a 9.6 MB dependency the app has
// zero code paths for. WebRTC's native init on a fresh iPad sandbox is
// the most probable source of the pre-JS NSException.
//
// This config forcibly disables autolinking for the common React Native
// WebRTC packages. If none are installed, entries are no-ops. If any
// transitive dep declares one, the null platform mapping prevents Expo
// prebuild from linking its Xcode target and pod, so the framework
// stops being bundled in the .app.
//
// Rebuild required to take effect:
//   npx expo prebuild --clean
//   eas build --platform ios --profile production
//
// If EAS build succeeds and the WebRTC.framework is no longer visible
// in the crash Binary Images list of the next crash log (or the app
// simply passes review), the block worked.

module.exports = {
  dependencies: {
    'react-native-webrtc': {
      platforms: {
        ios: null,
        android: null,
      },
    },
    '@stream-io/react-native-webrtc': {
      platforms: {
        ios: null,
        android: null,
      },
    },
    '@livekit/react-native-webrtc': {
      platforms: {
        ios: null,
        android: null,
      },
    },
    'react-native-webrtc-web-shim': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};
