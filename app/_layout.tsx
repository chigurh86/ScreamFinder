import React, { useState, useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider } from '@/template';
import { AppProvider } from '../contexts/AppContext';
import { AnimatedSplash } from '../components/feature/AnimatedSplash';
import { ErrorBoundary } from '../components/feature/ErrorBoundary';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

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
