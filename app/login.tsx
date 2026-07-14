import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../constants/theme';
import { useApp } from '../contexts/AppContext';

/**
 * Bypasses the template's generic sendOTP wrapper and calls Supabase
 * directly so the real error message (rate limit, unknown user, etc.)
 * surfaces to the UI instead of "Failed to send verification code".
 */
async function sendOtpDirect(
  email: string,
  shouldCreateUser: boolean
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser },
    });
    if (error) return { error: error.message || 'Failed to send code' };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

/**
 * Sign-in flow — bypasses the template's signInWithPassword wrapper so
 * the actual Supabase error surfaces (e.g. "Invalid login credentials",
 * "Email not confirmed") instead of a generic "Login Failed" message.
 *
 * IMPORTANT: We deliberately do NOT sign out first. Doing so would fire a
 * SIGNED_OUT event that races the subsequent SIGNED_IN event — the
 * template's onAuthStateChange listener can latch onto SIGNED_OUT and
 * never process the SIGNED_IN, leaving the app stuck on "Guest" even
 * though Supabase has a valid session on disk.
 */
async function signInWithPasswordDirect(
  email: string,
  password: string
): Promise<{
  error: string | null;
  hasSession: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return {
        error: error.message || 'Sign in failed',
        hasSession: false,
        accessToken: null,
        refreshToken: null,
      };
    }
    if (!data?.session) {
      return {
        error:
          'Signed in but no session was returned. Please try again.',
        hasSession: false,
        accessToken: null,
        refreshToken: null,
      };
    }
    return {
      error: null,
      hasSession: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Network error',
      hasSession: false,
      accessToken: null,
      refreshToken: null,
    };
  }
}

/**
 * Force the template's AuthProvider (which subscribes to Supabase's auth
 * state on the shared client) to see the newly-created session. Belt +
 * suspenders approach because the template's listener occasionally misses
 * the initial SIGNED_IN event fired by signInWithPassword.
 *
 * 1) setSession() explicitly re-broadcasts SIGNED_IN with the fresh tokens
 * 2) refreshSession() asks the AuthProvider to re-read its session cache
 * 3) Poll supabase.auth.getUser() to confirm the session actually landed
 */
async function forceSessionPropagation(
  accessToken: string,
  refreshToken: string,
  refreshSession: () => Promise<void>
): Promise<boolean> {
  const supabase = getSupabaseClient();

  // (1) Re-broadcast the SIGNED_IN event so any listener that missed
  // the original one gets a chance to update.
  try {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch {
    /* ignore — the session may already be identical */
  }

  // (2) Ask the AuthProvider to re-read its cached session.
  try {
    await refreshSession();
  } catch {
    /* ignore — the auth listener will catch up on its own */
  }

  // (3) Poll for up to ~2s to confirm the session is retrievable.
  for (let i = 0; i < 10; i++) {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (currentUser) return true;
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/**
 * Password reset flow — bypasses the template's verifyOTPAndLogin, which
 * only supports NEW signups (never calls updateUser). For existing users
 * we must: (1) verifyOtp to establish a session, then (2) updateUser to
 * actually change the password. Also returns the session tokens so the
 * caller can replay them (same fix as sign-in — avoids the "stuck on
 * Guest" bug caused by missed SIGNED_IN events).
 */
async function resetPasswordDirect(
  email: string,
  otp: string,
  newPassword: string
): Promise<{
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}> {
  try {
    const supabase = getSupabaseClient();

    // Step 1: Verify the OTP code. This establishes a session for the
    // existing user so we can then update their password.
    const { data: verifyData, error: verifyError } =
      await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

    if (verifyError) {
      return {
        error: verifyError.message || 'Verification failed',
        accessToken: null,
        refreshToken: null,
      };
    }
    if (!verifyData?.session) {
      return {
        error:
          'Could not create a session from that code. It may have expired \u2014 please request a new one.',
        accessToken: null,
        refreshToken: null,
      };
    }

    // Step 2: With the session live, update the password.
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return {
        error: updateError.message || 'Could not update password',
        accessToken: null,
        refreshToken: null,
      };
    }

    return {
      error: null,
      accessToken: verifyData.session.access_token,
      refreshToken: verifyData.session.refresh_token,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Network error',
      accessToken: null,
      refreshToken: null,
    };
  }
}

/**
 * Turns raw Supabase auth errors into user-facing troubleshooting text.
 */
function humanizeAuthError(msg: string): string {
  const lower = (msg || '').toLowerCase();
  if (
    lower.includes('rate') ||
    lower.includes('security purposes') ||
    lower.includes('too many') ||
    lower.includes('over_email_send_rate_limit') ||
    lower.match(/\b(after|in|wait)\s*\d+\s*second/i)
  ) {
    return 'Too many code requests recently. Please wait 60 seconds and try again. Also check your spam folder for a previous code.';
  }
  if (
    lower.includes('signups not allowed') ||
    lower.includes('signup is disabled') ||
    lower.includes('user not found') ||
    (lower.includes('user') && lower.includes('does not exist'))
  ) {
    return 'No account found with this email. Double-check the address, or tap "Back to Sign In" and create an account first.';
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'That email address looks invalid. Please check for typos.';
  }
  if (lower.includes('smtp') || lower.includes('email service')) {
    return 'Our email service is temporarily unavailable. Please try again in a few minutes or email support@screamfinder.app.';
  }
  return `${msg}\n\nTroubleshooting:\n\u2022 Check your spam / junk folder\n\u2022 Verify the email address is spelled correctly\n\u2022 Wait 60 seconds before trying again`;
}

/**
 * Humanizes sign-in specific errors from Supabase.
 */
function humanizeSignInError(msg: string): string {
  const lower = (msg || '').toLowerCase();
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid credentials') ||
    (lower.includes('invalid') && lower.includes('password'))
  ) {
    return 'Incorrect email or password. If you signed up with a code and never set a password, tap "Forgot Password?" below to set one now.';
  }
  if (
    lower.includes('email not confirmed') ||
    lower.includes('email_not_confirmed') ||
    lower.includes('confirm your email')
  ) {
    return 'Your email address has not been confirmed yet. Please check your inbox (and spam folder) for the verification link, or use "Forgot Password?" to receive a new code.';
  }
  if (
    lower.includes('user not found') ||
    (lower.includes('user') && lower.includes('does not exist'))
  ) {
    return 'No account found with this email. Tap "Sign Up" below to create one.';
  }
  if (
    lower.includes('rate') ||
    lower.includes('too many') ||
    lower.includes('security purposes')
  ) {
    return 'Too many sign-in attempts. Please wait a minute and try again.';
  }
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch')
  ) {
    return 'Network error \u2014 please check your internet connection and try again.';
  }
  return `${msg}\n\nIf you signed up with a verification code, you may not have set a password yet. Tap "Forgot Password?" to set one.`;
}

type AuthMode = 'login' | 'register' | 'otp' | 'forgot' | 'resetPassword';

export default function LoginScreen() {
  const {
    sendOTP,
    verifyOTPAndLogin,
    signInWithPassword,
    refreshSession,
    operationLoading,
  } = useAuth();
  const { showAlert } = useAlert();
  const { refreshProfile } = useApp();
  const router = useRouter();

  const handleLogoPress = () => {
    Haptics.selectionAsync();
    router.replace('/(tabs)');
  };

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [cooldownSecs, setCooldownSecs] = useState(0);

  // Countdown timer for the resend cooldown. Prevents rapid retries
  // that would otherwise trip Supabase's per-email OTP rate limit.
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const t = setInterval(() => {
      setCooldownSecs((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownSecs]);

  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Missing Fields', 'Please enter both email and password.');
      return;
    }
    setIsSigningIn(true);
    // Direct Supabase call — surfaces the real error ("Invalid login
    // credentials", "Email not confirmed", etc.) instead of the template
    // wrapper's generic "Login Failed" that gives users no guidance.
    const { error, hasSession, accessToken, refreshToken } =
      await signInWithPasswordDirect(email.trim(), password);
    if (error) {
      setIsSigningIn(false);
      showAlert('Sign In Failed', humanizeSignInError(error));
      return;
    }
    if (!hasSession || !accessToken || !refreshToken) {
      setIsSigningIn(false);
      showAlert(
        'Sign In Failed',
        'Signed in but the session was not persisted. Please try again.'
      );
      return;
    }
    // Force the AuthProvider to see the freshly-created session so the
    // "Guest" state in the app flips over to the logged-in user before we
    // navigate away. See forceSessionPropagation() docstring for why this
    // three-step dance is necessary.
    const propagated = await forceSessionPropagation(
      accessToken,
      refreshToken,
      refreshSession
    );
    // Explicitly refresh the profile (avatar + username) now that the
    // session is guaranteed live. This side-steps any race between the
    // AuthProvider's user-effect firing and Supabase's PostgREST client
    // attaching the JWT to the RLS-protected user_profiles query.
    try {
      await refreshProfile();
    } catch {
      /* non-fatal — the AppContext user-effect will retry */
    }
    setIsSigningIn(false);
    if (!propagated) {
      showAlert(
        'Signed In',
        'You are signed in, but the app is taking a moment to sync. If your account does not appear on the next screen, please close and reopen the app.'
      );
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  };

  const handleForgotSendOTP = async () => {
    if (!email.trim()) {
      showAlert('Missing Email', 'Please enter your email address.');
      return;
    }
    if (cooldownSecs > 0) {
      showAlert(
        'Please Wait',
        `You can request a new code in ${cooldownSecs} seconds. Check your spam folder while you wait.`
      );
      return;
    }
    // Direct Supabase call — surfaces real errors instead of the generic
    // "Failed to send verification code" the template wrapper returns.
    // shouldCreateUser=false ensures we only send OTPs to existing accounts.
    const { error } = await sendOtpDirect(email.trim(), false);
    if (error) {
      setCooldownSecs(60);
      showAlert('Reset Code Failed', humanizeAuthError(error));
      return;
    }
    setCooldownSecs(60);
    showAlert(
      'Code Sent',
      `A verification code has been sent to ${email.trim()}. It may take up to a minute to arrive \u2014 check your spam folder if you don't see it.`
    );
    setOtp('');
    setNewPassword('');
    setConfirmNewPassword('');
    setMode('resetPassword');
  };

  const [isResetting, setIsResetting] = useState(false);

  const handleResetPassword = async () => {
    if (!otp.trim()) {
      showAlert('Missing Code', 'Please enter the verification code.');
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      showAlert('Weak Password', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    setIsResetting(true);
    const { error, accessToken, refreshToken } = await resetPasswordDirect(
      email.trim(),
      otp.trim(),
      newPassword
    );
    if (error) {
      setIsResetting(false);
      showAlert('Reset Failed', humanizeAuthError(error));
      return;
    }
    // Force AuthProvider to see the new session so the app doesn't
    // land on the tabs still showing "Guest".
    if (accessToken && refreshToken) {
      await forceSessionPropagation(accessToken, refreshToken, refreshSession);
    }
    // Pull down avatar + username now that the session is live.
    try {
      await refreshProfile();
    } catch {
      /* non-fatal — AppContext will retry */
    }
    setIsResetting(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(
      'Password Reset',
      'Your password has been updated and you are now signed in.',
      [
        {
          text: 'Continue',
          onPress: () => router.replace('/(tabs)'),
        },
      ]
    );
  };

  const handleSendOTP = async () => {
    if (!email.trim()) {
      showAlert('Missing Email', 'Please enter your email address.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      showAlert(
        'Weak Password',
        'Password must be at least 6 characters.'
      );
      return;
    }
    if (password !== confirmPassword) {
      showAlert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (cooldownSecs > 0) {
      showAlert(
        'Please Wait',
        `You can request a new code in ${cooldownSecs} seconds. Check your spam folder while you wait.`
      );
      return;
    }
    // Direct Supabase call with shouldCreateUser=true for new signups.
    const { error } = await sendOtpDirect(email.trim(), true);
    if (error) {
      setCooldownSecs(60);
      showAlert('Sign Up Failed', humanizeAuthError(error));
      return;
    }
    setCooldownSecs(60);
    showAlert(
      'Code Sent',
      `A verification code has been sent to ${email.trim()}. Check your spam folder if you don't see it within a minute.`
    );
    setMode('otp');
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      showAlert('Missing Code', 'Please enter the verification code.');
      return;
    }
    const { error } = await verifyOTPAndLogin(email.trim(), otp.trim(), {
      password,
    });
    if (error) {
      showAlert('Verification Failed', error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo & Branding */}
          <Animated.View
            entering={FadeInDown.duration(500)}
            style={styles.brandSection}
          >
            <Image
              source={require('../assets/images/spooky-eyes.png')}
              style={styles.spookyEyes}
              contentFit="contain"
            />
            <Pressable
              onPress={handleLogoPress}
              hitSlop={12}
              accessibilityLabel="Return to home"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.logoRow,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Image
                source={require('../assets/images/knife-logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
            </Pressable>
            <Text style={styles.subtitle}>
              {mode === 'otp' || mode === 'resetPassword'
                ? 'Enter the verification code'
                : mode === 'forgot'
                  ? 'Reset your password'
                  : 'Sign in to summon terrifying recommendations'}
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View
            entering={FadeInDown.delay(150).duration(400)}
            style={styles.formCard}
          >
            {mode === 'forgot' ? (
              <>
                <Text style={styles.otpHint}>
                  Enter your email to receive a reset code
                </Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={theme.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={theme.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    numberOfLines={1}
                    autoFocus
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    (operationLoading || cooldownSecs > 0) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={handleForgotSendOTP}
                  disabled={operationLoading || cooldownSecs > 0}
                >
                  {operationLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : cooldownSecs > 0 ? (
                    <Text style={styles.primaryButtonText}>
                      Retry in {cooldownSecs}s
                    </Text>
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Send Reset Code
                    </Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setMode('login')}>
                  <Text style={styles.switchText}>Back to Sign In</Text>
                </Pressable>
              </>
            ) : mode === 'resetPassword' ? (
              <>
                <Text style={styles.otpHint}>
                  We sent a reset code to {email}
                </Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="key-outline"
                    size={18}
                    color={theme.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Verification code"
                    placeholderTextColor={theme.textMuted}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    autoFocus
                  />
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={theme.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="New password"
                    placeholderTextColor={theme.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.textMuted}
                    />
                  </Pressable>
                </View>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={theme.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor={theme.textMuted}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    secureTextEntry={!showPassword}
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    (operationLoading || isResetting) && styles.buttonDisabled,
                  ]}
                  onPress={handleResetPassword}
                  disabled={operationLoading || isResetting}
                >
                  {operationLoading || isResetting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Reset Password & Sign In
                    </Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setMode('forgot')}>
                  <Text style={styles.switchText}>Go back</Text>
                </Pressable>
              </>
            ) : mode === 'otp' ? (
              <>
                <Text style={styles.otpHint}>
                  We sent a code to {email}
                </Text>
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="key-outline"
                    size={18}
                    color={theme.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Verification code"
                    placeholderTextColor={theme.textMuted}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    autoFocus
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    operationLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleVerifyOTP}
                  disabled={operationLoading}
                >
                  {operationLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Verify & Create Account
                    </Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setMode('register')}>
                  <Text style={styles.switchText}>
                    Go back
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* Email */}
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={theme.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor={theme.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    numberOfLines={1}
                  />
                </View>

                {/* Password */}
                <View style={styles.inputWrapper}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={theme.textMuted}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={theme.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={theme.textMuted}
                    />
                  </Pressable>
                </View>

                {/* Confirm Password (register only) */}
                {mode === 'register' ? (
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={theme.textMuted}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm password"
                      placeholderTextColor={theme.textMuted}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                    />
                  </View>
                ) : null}

                {/* Submit */}
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    (operationLoading ||
                      isSigningIn ||
                      (mode === 'register' && cooldownSecs > 0)) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={mode === 'login' ? handleLogin : handleSendOTP}
                  disabled={
                    operationLoading ||
                    isSigningIn ||
                    (mode === 'register' && cooldownSecs > 0)
                  }
                >
                  {operationLoading || isSigningIn ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : mode === 'register' && cooldownSecs > 0 ? (
                    <Text style={styles.primaryButtonText}>
                      Retry in {cooldownSecs}s
                    </Text>
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {mode === 'login' ? 'Sign In' : 'Create Account'}
                    </Text>
                  )}
                </Pressable>

                {/* Forgot Password (login only) */}
                {mode === 'login' ? (
                  <Pressable onPress={() => setMode('forgot')}>
                    <Text style={styles.forgotText}>Forgot Password?</Text>
                  </Pressable>
                ) : null}

                {/* Toggle mode */}
                <Pressable
                  onPress={() =>
                    setMode(mode === 'login' ? 'register' : 'login')
                  }
                >
                  <Text style={styles.switchText}>
                    {mode === 'login'
                      ? "Don't have an account? Sign Up"
                      : 'Already have an account? Sign In'}
                  </Text>
                </Pressable>
              </>
            )}
          </Animated.View>

          {/* Free tier info */}
          <Animated.View
            entering={FadeInDown.delay(300).duration(400)}
            style={styles.freeInfo}
          >
            <Ionicons name="gift-outline" size={18} color={theme.accent} />
            <Text style={styles.freeInfoText}>
              3 free searches per day included
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  spookyEyes: {
    width: 140,
    height: 80,
    marginBottom: 16,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 232,
    height: 58,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.primary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  forgotText: {
    fontSize: 13,
    color: theme.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  formCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    gap: 14,
  },
  otpHint: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151519',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    height: 64,
    gap: 10,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    color: theme.textPrimary,
    // Remove default focus outline on web/native and enable
    // horizontal scrolling of long values (e.g. long emails).
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
          outlineColor: 'transparent',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        } as object)
      : {}),
  },
  primaryButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonPressed: {
    backgroundColor: theme.primaryDark,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  switchText: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  freeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  freeInfoText: {
    fontSize: 13,
    color: theme.textSecondary,
  },
});
