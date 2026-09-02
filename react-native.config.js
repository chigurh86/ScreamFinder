// react-native.config.js
//
// BUILD 26+ HARDENING: Block autolinking of native modules that
// ScreamFinder does not use but that may be pulled into the iOS binary
// as transitive dependencies. Apple's iPadOS 26.6 test device crashed
// Build 24 200ms after launch on
// `com.facebook.react.ExceptionsManagerQueue`, and the binary's
// Frameworks directory contained WebRTC.framework — a 9.6 MB dependency
// the app has zero code paths for. WebRTC's native init on a fresh iPad
// sandbox is a probable source of the pre-JS NSException.
//
// A full import audit of `app/`, `components/`, `contexts/`, `services/`,
// and `template/` confirms ScreamFinder imports ONLY these native
// modules:
//
//   - react, react-native
//   - expo-router, expo-image, expo-haptics, expo-splash-screen,
//     expo-status-bar, expo-web-browser, expo-image-picker,
//     expo-constants, expo-linking (via react-native's Linking)
//   - react-native-safe-area-context
//   - react-native-reanimated
//   - react-native-url-polyfill
//   - @expo/vector-icons
//   - @supabase/supabase-js
//   - @react-native-async-storage/async-storage
//
// EVERYTHING ELSE is a candidate for removal in package.json. In
// particular, these packages were confirmed absent from all imports:
//   - react-native-webrtc / @stream-io/react-native-webrtc /
//     @livekit/react-native-webrtc / react-native-webrtc-web-shim
//   - react-native-iap  (already removed in Build 18, verify still gone)
//   - @sentry/react-native
//   - expo-av, expo-video
//   - expo-camera, expo-notifications, expo-location, expo-contacts,
//     expo-calendar, expo-media-library, expo-file-system
//   - react-native-paper, react-native-svg, react-native-maps
//   - react-native-vision-camera, react-native-audio-api
//   - @react-native-voice/voice, @react-native-community/netinfo
//   - react-native-video, react-native-track-player
//   - react-native-permissions, react-native-device-info
//
// If any of the above appear in package.json, run
// `npm uninstall <package>` for each, then `npx expo prebuild --clean`
// and rebuild. Every uninstalled native module = one fewer surface
// where iPadOS 26.6 sandbox init can throw.
//
// This config forcibly disables autolinking for the common WebRTC
// carriers and other unused native modules. Missing packages are
// no-ops; if any transitive dep declares one, the null platform
// mapping prevents Expo prebuild from linking its Xcode target and
// pod, so the framework stops being bundled in the .app.
//
// Rebuild required to take effect:
//   npx expo prebuild --clean
//   eas build --platform ios --profile production
//
// After rebuild, unzip the resulting .ipa and inspect Payload/
// ScreamFinder.app/Frameworks/. If WebRTC.framework is gone, the block
// worked. If it's still there, the transitive path is somewhere this
// config isn't catching — check the Pods project in
// ios/ScreamFinder.xcworkspace to see which pod declares
// `dependency 'WebRTC'`.

module.exports = {
  dependencies: {
    // ---- WebRTC carriers (confirmed absent from imports) ----
    'react-native-webrtc': {
      platforms: { ios: null, android: null },
    },
    '@stream-io/react-native-webrtc': {
      platforms: { ios: null, android: null },
    },
    '@livekit/react-native-webrtc': {
      platforms: { ios: null, android: null },
    },
    'react-native-webrtc-web-shim': {
      platforms: { ios: null, android: null },
    },
    'livekit-react-native': {
      platforms: { ios: null, android: null },
    },
    '@stream-io/video-react-native-sdk': {
      platforms: { ios: null, android: null },
    },

    // ---- IAP: confirmed absent from imports; iapService.native.ts
    // uses expo-in-app-purchases lazily instead. Block the react-native
    // one so nothing links StoreKit natively at boot. ----
    'react-native-iap': {
      platforms: { ios: null, android: null },
    },

    // ---- Sentry: removed in Build 18, keep blocked so a transitive
    // reintroduction can't relink its native pod. ----
    '@sentry/react-native': {
      platforms: { ios: null, android: null },
    },

    // ---- Camera / video / audio native modules (unused) ----
    'react-native-vision-camera': {
      platforms: { ios: null, android: null },
    },
    'react-native-video': {
      platforms: { ios: null, android: null },
    },
    'react-native-track-player': {
      platforms: { ios: null, android: null },
    },
    'react-native-audio-api': {
      platforms: { ios: null, android: null },
    },
    '@react-native-voice/voice': {
      platforms: { ios: null, android: null },
    },

    // ---- Miscellaneous native modules confirmed absent from imports ----
    'react-native-maps': {
      platforms: { ios: null, android: null },
    },
    'react-native-permissions': {
      platforms: { ios: null, android: null },
    },
    'react-native-device-info': {
      platforms: { ios: null, android: null },
    },
    '@react-native-community/netinfo': {
      platforms: { ios: null, android: null },
    },
  },
};
