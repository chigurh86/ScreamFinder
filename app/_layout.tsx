import React, { useState, useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider } from '@/template';
import { AppProvider } from '../contexts/AppContext';
import { AnimatedSplash } from '../components/feature/AnimatedSplash';
import { ErrorBoundary } from '../components/feature/ErrorBoundary';
import { initErrorReporting } from '../services/errorReportingService';
import { suppressBenignAuthErrors } from '../services/authRecoveryService';
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

  useEffect(() => {
    SplashScreen.hideAsync();
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
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="login" />
                <Stack.Screen
                  name="movie-detail"
                  options={{
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }}
                />
                <Stack.Screen
                  name="privacy"
                  options={{
                    headerShown: false,
                    animation: 'slide_from_right',
                  }}
                />
                <Stack.Screen
                  name="terms"
                  options={{
                    headerShown: false,
                    animation: 'slide_from_right',
                  }}
                />
              </Stack>
              {showSplash ? <AnimatedSplash onFinish={handleSplashFinish} /> : null}
            </AppProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </AlertProvider>
    </ErrorBoundary>
  );
}
