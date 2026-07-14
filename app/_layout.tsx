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

SplashScreen.preventAutoHideAsync();

// Silence known-benign Supabase auth errors (e.g. an expired refresh
// token surfaced as "Invalid Refresh Token: Refresh Token Not Found").
// Must run before AuthProvider mounts so the initial session recovery
// error is intercepted.
suppressBenignAuthErrors();

// Initialize Sentry as early as possible so it can capture even module-load
// errors. Safe no-op if EXPO_PUBLIC_SENTRY_DSN is not configured.
initErrorReporting();

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
                  <AnimatedSplash
                    onLayout={handleSplashLayout}
                    onFinish={handleSplashFinish}
                  />
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
