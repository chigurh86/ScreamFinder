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
import { installGlobalErrorHandlers } from '../services/globalErrorHandler';
import { suppressBenignAuthErrors } from '../services/authRecoveryService';
import { theme } from '../constants/theme';
import * as SplashScreen from 'expo-splash-screen';

// Install the global JS error handler at MODULE SCOPE — before any
// other JS runs. `installGlobalErrorHandlers` is fully guarded and
// cannot throw, so it's safe to run before React mounts. This is the
// critical fix for the Build 18 crash: any subsequent uncaught JS
// error is downgraded to non-fatal instead of triggering RCTFatal →
// abort() on the ExceptionsManagerQueue.
try {
  installGlobalErrorHandlers();
} catch {
  /* installGlobalErrorHandlers is designed to never throw —
     the outer try/catch is belt-and-suspenders. */
}

// NOTE: We used to run SplashScreen.preventAutoHideAsync(),
// suppressBenignAuthErrors(), and initErrorReporting() at MODULE SCOPE
// (top-level side effects). On iOS 26 real devices, any synchronous
// exception thrown inside these calls before React mounts is fatal:
// there is no bridge, no ErrorBoundary, no Sentry — the process is
// terminated with RCTFatal / EXC_CRASH. We now run all three inside
// a lazy useEffect in the RootLayout component so they execute AFTER
// the JS runtime is fully spun up and any throw is contained.
let bootSideEffectsRun = false;
function runBootSideEffectsOnce() {
  if (bootSideEffectsRun) return;
  bootSideEffectsRun = true;

  // Global error handler was already installed at module scope; no
  // need to re-install here. Everything below runs in the useEffect
  // now-that-React-has-mounted phase.

  try {
    SplashScreen.preventAutoHideAsync();
  } catch {
    /* preventAutoHideAsync can reject on some hosts; splash will still show. */
  }

  try {
    suppressBenignAuthErrors();
  } catch (e) {
    if (__DEV__) console.warn('[boot] suppressBenignAuthErrors failed', e);
  }

  try {
    initErrorReporting();
  } catch (e) {
    if (__DEV__) console.warn('[boot] initErrorReporting failed', e);
  }
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  // Run boot side effects exactly once, INSIDE the React tree, so any
  // throw is caught by the outer ErrorBoundary instead of crashing the
  // native process.
  useEffect(() => {
    runBootSideEffectsOnce();
  }, []);

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
