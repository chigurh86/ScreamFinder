module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-reanimated/plugin MUST be listed last. It compiles
      // worklets used by FadeIn/FadeInDown layout animations,
      // useSharedValue, useAnimatedStyle, withTiming, withRepeat, etc.
      // Without it, Reanimated throws at runtime when the first
      // animation runs — which on iPadOS 26's stricter JSC surfaces
      // as an EXC_CRASH on launch, exactly matching the App Store
      // rejection crash on iPad Air 11" (M3), iPadOS 26.5.2.
      'react-native-reanimated/plugin',
    ],
  };
};
