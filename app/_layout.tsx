import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider } from '@/template';
import { AppProvider } from '../contexts/AppContext';
import { AnimatedSplash } from '../components/feature/AnimatedSplash';
import { ErrorBoundary } from '../components/feature/ErrorBoundary';
import { initErrorReporting } from '../services/errorReportingService';
import { suppressBenignAuthErrors } from '../services/authRecoveryService';
import { theme } from '../constants/theme';
import * as SplashScreen from 'expo-splash-screen';

// Every module-load-time side-effect below is wrapped in try/catch so that
// a synchronous exception in any of them cannot escalate to React Native's
// RCTFatal path (which shows up as an EXC_CRASH/SIGABRT on Thread 13
// `com.facebook.react.ExceptionsManagerQueue` in App Store crash logs).
// The ErrorBoundary below only catches React render errors — it cannot
// rescue anything that throws at import time.
try {
  SplashScreen.preventAutoHideAsync();
} catch {
  /* preventAutoHideAsync can reject on some hosts; splash will still show. */
}

// Silence known-benign Supabase auth errors (e.g. an expired refresh
// token surfaced as "Invalid Refresh Token: Refresh Token Not Found").
// Must run before AuthProvider mounts so the initial session recovery
// error is intercepted.
try {
  suppressBenignAuthErrors();
} catch (e) {
  if (__DEV__) console.warn('[boot] suppressBenignAuthErrors failed', e);
}

// Initialize Sentry as early as possible so it can capture even module-load
// errors. Safe no-op if EXPO_PUBLIC_SENTRY_DSN is not configured.
try {
  initErrorReporting();
} catch (e) {
  if (__DEV__) console.warn('[boot] initErrorReporting failed', e);
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashLayout = useCallback(() => {
    // Only dismiss the native splash once our JS splash has actually
    // painted its first frame. Prevents the white flash caused by
    // hiding the native splash before AnimatedSplash renders.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  return (
    <ErrorBoundary>
      <AlertProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <AppProvider>
              <StatusBar style="light" />
              {/* Root dark background prevents any transparent frame
                  from showing RN's default white view. */}
              <View style={styles.root}>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: theme.background },
                    animation: 'fade',
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="login" />
                  <Stack.Screen
                    name="movie-detail"
                    options={{
                      presentation: 'modal',
                      animation: 'slide_from_bottom',
                      contentStyle: { backgroundColor: theme.background },
                    }}
                  />
                  <Stack.Screen
                    name="privacy"
                    options={{
                      headerShown: false,
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: theme.background },
                    }}
                  />
                  <Stack.Screen
                    name="terms"
                    options={{
                      headerShown: false,
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: theme.background },
                    }}
                  />
                </Stack>
                {showSplash ? (
                  // Nested ErrorBoundary specifically around the splash.
                  // If any Animated.timing / Image / layout call throws
                  // during the very first frame (which is when iPadOS 26
                  // has historically crashed us), the ErrorBoundary will
                  // catch it, forward to Sentry, and simply dismiss the
                  // splash instead of letting the exception bubble up to
                  // the native RCTFatal path. The rest of the app keeps
                  // running normally.
                  <ErrorBoundary>
                    <AnimatedSplash
                      onLayout={handleSplashLayout}
                      onFinish={handleSplashFinish}
                    />
                  </ErrorBoundary>
                ) : null}
              </View>
            </AppProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </AlertProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.background,
  },
});
