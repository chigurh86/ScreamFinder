import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { theme } from '../../constants/theme';

// NOTE: `Dimensions.get('window')` intentionally NOT called at module
// scope. On iPad running an iPhone-only app in compatibility mode, the
// window dimensions can be zero or the raw physical dimensions before
// the compatibility-mode frame is applied. Reading them at module load
// (which happens during the JS boot phase) caused erratic style values
// on iPad Air 11" (M3). All screens using Dimensions now read them
// inside the component body / useEffect where the frame is stable.

interface AnimatedSplashProps {
  onFinish: () => void;
  onLayout?: () => void;
}

export function AnimatedSplash({ onFinish, onLayout }: AnimatedSplashProps) {
  const eyesOpacity = useRef(new Animated.Value(0)).current;
  const eyesScale = useRef(new Animated.Value(0.7)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.5)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  // NOTE: We used to precompute Animated.multiply(...) inside useRef init
  // to avoid re-creating them on every render. On iOS 26 real devices
  // that call inside useRef initialization was crashing the app at
  // launch (RCTFatal on the animation graph). We now just apply a
  // static numeric scale factor via inline transform — no dynamic
  // animated node is created during render, so nothing can throw.

  useEffect(() => {
    let finished = false;
    const safeFinish = () => {
      if (finished) return;
      finished = true;
      onFinish();
    };

    // Phase 1: Blood-red glow pulses in
    Animated.sequence([
      Animated.delay(200),
      // Glow appears
      Animated.parallel([
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(glowScale, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      // Eyes fade in with scale
      Animated.parallel([
        Animated.timing(eyesOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(eyesScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      // Title slides up
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Hold for a moment
      Animated.delay(800),
      // Fade out entire splash
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      safeFinish();
    });

    // Safety net: ensure splash dismisses within 4 seconds even if any
    // animation step is interrupted (e.g. hot reload, web rendering quirks).
    const fallbackTimeout = setTimeout(safeFinish, 4000);
    return () => clearTimeout(fallbackTimeout);
  }, []);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[styles.container, { opacity: containerOpacity }]}
    >
      {/* Blood-red glow behind eyes */}
      <Animated.View
        style={[
          styles.glowCircle,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* Secondary pulse glow — driven by same glowOpacity/glowScale
          but multiplied via interpolate (safe on all platforms). */}
      <Animated.View
        style={[
          styles.glowCircleOuter,
          {
            opacity: glowOpacity.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.4],
            }),
            transform: [
              {
                scale: glowScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1.5],
                }),
              },
            ],
          },
        ]}
      />

      {/* Spooky eyes */}
      <Animated.View
        style={[
          styles.eyesContainer,
          {
            opacity: eyesOpacity,
            transform: [{ scale: eyesScale }],
          },
        ]}
      >
        <Image
          source={require('../../assets/images/spooky-eyes.png')}
          style={styles.eyesImage}
          contentFit="contain"
        />
      </Animated.View>

      {/* App title */}
      <Animated.View
        style={[
          styles.titleContainer,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          },
        ]}
      >
        <View style={styles.titleRow}>
          <Image
            source={require('../../assets/images/knife-logo.png')}
            style={styles.knifeLogo}
            contentFit="contain"
          />
        </View>
        <Animated.Text style={styles.tagline}>Find your next nightmare</Animated.Text>
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
  glowCircle: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 60,
    elevation: 20,
  },
  glowCircleOuter: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  eyesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyesImage: {
    width: 180,
    height: 100,
  },
  titleContainer: {
    alignItems: 'center',
    marginTop: 32,
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
  title: {
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
