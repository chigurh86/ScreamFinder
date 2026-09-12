import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';
import { Image } from 'expo-image';
import { theme } from '../../constants/theme';

// BUILD 28 HARDENING (iOS 27 crash mitigation):
// Apple rejected Build 27 with a launch crash on iPhone 17 Pro Max
// running iOS 27.0. iOS 27 tightens the RN native animation driver
// and image-decode paths compared to iOS 26. Every extra Animated
// node, parallel sequence, and inline interpolate() we allocate at
// splash time is another place where a native NSException can fire
// on the ExceptionsManagerQueue before React's ErrorBoundary can
// intercept it.
//
// This splash has been reduced to the absolute minimum:
//   - 2 Animated.Value refs (down from 7)
//   - 1 timing sequence with 3 steps (down from a parallel/sequence chain)
//   - Zero .interpolate() calls in JSX (they created new native
//     interpolation nodes on every render pass)
//   - All Animated.start() calls wrapped in try/catch
//   - Hard 3.5s finish timeout so the splash NEVER hangs
//   - Text fallback that renders instantly even if both image
//     assets fail to decode
//
// If any of the reduced surface still throws on iOS 27, the outer
// ErrorBoundary in _layout.tsx catches it and dismisses the splash
// via onFinish(), letting the app boot normally.

interface AnimatedSplashProps {
  onFinish: () => void;
  onLayout?: () => void;
}

export function AnimatedSplash({ onFinish, onLayout }: AnimatedSplashProps) {
  // Just two shared values: one for content fade-in, one for the
  // whole container fade-out. Everything else is derived directly
  // via Animated (no interpolate()).
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  const [eyesLoadFailed, setEyesLoadFailed] = useState(false);
  const [knifeLoadFailed, setKnifeLoadFailed] = useState(false);

  const handleEyesError = useCallback(() => {
    setEyesLoadFailed(true);
  }, []);

  const handleKnifeError = useCallback(() => {
    setKnifeLoadFailed(true);
  }, []);

  useEffect(() => {
    let finished = false;
    const safeFinish = () => {
      if (finished) return;
      finished = true;
      try {
        onFinish();
      } catch {
        /* onFinish must never throw the splash into a bad state */
      }
    };

    // Absolute-worst-case safety net. If ANY Animated call below
    // fails silently or hangs on iOS 27, we still dismiss the splash
    // after 3.5 seconds and let the app take over.
    const hardTimeout = setTimeout(safeFinish, 3500);

    try {
      // Simple, single-track sequence:
      //   1. Fade content in over 600ms
      //   2. Hold for 1400ms
      //   3. Fade whole container out over 400ms
      // No parallel calls, no interpolations, no spring physics.
      Animated.sequence([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.delay(1400),
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
        safeFinish();
      });
    } catch {
      // Animated.start() itself threw. Let the hard timeout finish us.
    }

    return () => clearTimeout(hardTimeout);
  }, [contentOpacity, containerOpacity, onFinish]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[styles.container, { opacity: containerOpacity }]}
    >
      <Animated.View
        style={[styles.content, { opacity: contentOpacity }]}
      >
        {eyesLoadFailed ? (
          <View style={styles.eyesFallback} />
        ) : (
          <Image
            source={require('../../assets/images/spooky-eyes.png')}
            style={styles.eyesImage}
            contentFit="contain"
            onError={handleEyesError}
          />
        )}

        <View style={styles.titleRow}>
          {knifeLoadFailed ? (
            <Text style={styles.titleFallback}>ScreamFinder</Text>
          ) : (
            <Image
              source={require('../../assets/images/knife-logo.png')}
              style={styles.knifeLogo}
              contentFit="contain"
              onError={handleKnifeError}
            />
          )}
        </View>

        <Text style={styles.tagline}>Find your next nightmare</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyesImage: {
    width: 180,
    height: 100,
    marginBottom: 32,
  },
  eyesFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(220, 38, 38, 0.35)',
    marginBottom: 32,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  knifeLogo: {
    width: 256,
    height: 64,
  },
  titleFallback: {
    fontSize: 30,
    fontWeight: '800',
    color: theme.primary,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
