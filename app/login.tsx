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
import { useAlert, getSupabaseClient } from '@/template';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../constants/theme';
import { useApp } from '../contexts/AppContext';

/**
 * Bypasses the template's generic sendOTP wrapper and calls Supabase
 * directly so the real error message (rate limit, unknown user, etc.)
 * surfaces to the UI instead of "Failed to send verification code".
 *
 * Used for password reset (existing accounts only).
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
 * Proper account creation flow. Calls Supabase's signUp() which:
 *   (a) creates the user WITH the password set atomically, and
 *   (b) sends the email verification OTP.
 *
 * This replaces the previous flawed "signInWithOtp then updateUser"
 * pattern where the password often failed to persist for brand-new
 * accounts — users would appear to sign up successfully but then be
 * unable to log back in with "Invalid credentials" errors.
 *
 * If the email is already registered but unconfirmed, Supabase will
 * automatically resend the confirmation OTP. If it's registered and
 * already confirmed, we surface a friendly "sign in instead" message.
 */
async function signUpWithOtpDirect(
  email: string,
  password: string
): Promise<{ error: string | null; alreadyRegistered: boolean }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      const lower = (error.message || '').toLowerCase();
      // Detect "already registered / confirmed" errors so the caller can
      // route the user to the sign-in tab instead of a scary error.
      const alreadyRegistered =
        lower.includes('already registered') ||
        lower.includes('user already') ||
        lower.includes('already exists');
      return {
        error: error.message || 'Sign up failed',
        alreadyRegistered,
      };
    }
    // Detect the "user already exists but unconfirmed" edge case: when
    // this happens, Supabase returns success but with identities=[] on
    // the user object. In that case Supabase has resent the confirmation
    // OTP; the caller should proceed to the OTP screen either way.
    const identities = data?.user?.identities;
    if (identities && identities.length === 0) {
      // Silent success — confirmation OTP was resent for an existing
      // unconfirmed account. Proceed to OTP screen as normal.
    }
    return { error: null, alreadyRegistered: false };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Network error',
      alreadyRegistered: false,
    };
  }
}

/**
 * Verifies the signup OTP and completes account creation. Because the
 * password was already set by signUp() at account-creation time, we do
 * NOT need to call updateUser here — verifyOtp alone confirms the email
 * address and establishes a valid session.
 *
 * Uses type: 'signup' (not 'email') because this is a signup
 * confirmation, not a magic-link login. The wrong type can cause
 * verification to succeed without actually marking the account as
 * confirmed, leaving the user in a broken state.
 */
async function verifySignupOtpDirect(
  email: string,
  otp: string
): Promise<{
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
}> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'signup',
    });
    if (error) {
      return {
        error: error.message || 'Verification failed',
        accessToken: null,
        refreshToken: null,
      };
    }
    if (!data?.session) {
      return {
        error:
          'Could not create a session from that code. It may have expired \u2014 please request a new one.',
        accessToken: null,
        refreshToken: null,
      };
    }
    return {
      error: null,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
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
 * Humanizes OTP verification errors so the user knows exactly what to do
 * (request a fresh code, remove extra spaces, use the newest code, etc.).
 */
function humanizeVerifyError(msg: string): string {
  const lower = (msg || '').toLowerCase();
  if (
    lower.includes('expired') ||
    lower.includes('token has expired') ||
    lower.includes('otp_expired')
  ) {
    return 'That verification code has expired. Codes are only valid for about an hour. Tap "Go back" and request a new one.';
  }
  if (
    lower.includes('invalid') ||
    lower.includes('token not found') ||
    lower.includes('token_not_found') ||
    lower.includes('otp_disabled')
  ) {
    return 'That code is incorrect.\n\nTroubleshooting:\n\u2022 Use the code from the MOST RECENT email (older codes stop working the moment a new one is sent)\n\u2022 Check for extra spaces if you pasted it\n\u2022 Codes are ' + '4 digits — make sure you did not include extra characters\n\u2022 If still failing, tap "Go back" and request a fresh code';
  }
  if (
    lower.includes('rate') ||
    lower.includes('too many') ||
    lower.includes('security purposes')
  ) {
    return 'Too many verification attempts. Please wait a minute and try again.';
  }
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to fetch')
  ) {
    return 'Network error \u2014 please check your internet connection and try again.';
  }
  return `${msg}\n\nTry tapping "Go back" and requesting a fresh code, then use the newest one you receive.`;
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
  // We no longer use the template's useAuth() — all auth flows go through
  // direct Supabase calls, and AppContext manages the actual user state
  // via its own onAuthStateChange subscription. See AppContext.tsx for
  // why the template's AuthProvider is unreliable.
  const { showAlert } = useAlert();
  const { refreshProfile, refreshAuthState } = useApp();
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
    const { error, hasSession } = await signInWithPasswordDirect(
      email.trim(),
      password
    );
    if (error) {
      setIsSigningIn(false);
      showAlert('Sign In Failed', humanizeSignInError(error));
      return;
    }
    if (!hasSession) {
      setIsSigningIn(false);
      showAlert(
        'Sign In Failed',
        'Signed in but the session was not persisted. Please try again.'
      );
      return;
    }
    // Ask AppContext to re-read the Supabase session so currentUser
    // updates BEFORE we navigate. AppContext manages user state via its
    // own onAuthStateChange subscription on the same shared Supabase
    // client, so this reliably reflects the freshly-created session
    // — no more "stuck on Guest" bug from the flaky template AuthProvider.
    const authUser = await refreshAuthState();
    if (!authUser) {
      setIsSigningIn(false);
      showAlert(
        'Sign In Failed',
        'Signed in but the session did not persist locally. Please close and reopen the app, then try again.'
      );
      return;
    }
    // Pull avatar + username now that we know the session is live.
    try {
      await refreshProfile();
    } catch {
      /* non-fatal — AppContext will retry via its user-effect */
    }
    setIsSigningIn(false);
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
  const [isVerifying, setIsVerifying] = useState(false);

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
    const { error } = await resetPasswordDirect(
      email.trim(),
      otp.trim(),
      newPassword
    );
    if (error) {
      setIsResetting(false);
      showAlert('Reset Failed', humanizeAuthError(error));
      return;
    }
    // Ask AppContext to re-read the session so currentUser updates
    // before we navigate. AppContext's onAuthStateChange subscription
    // usually already picked up the event fired by verifyOtp, but this
    // explicit refresh guarantees the state is fresh.
    await refreshAuthState();
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
    // Use signUp() so the password is persisted AT account-creation
    // time. Previously we used signInWithOtp() + updateUser() which
    // frequently dropped the password for brand-new accounts, leaving
    // users unable to log back in with "Invalid credentials".
    const { error, alreadyRegistered } = await signUpWithOtpDirect(
      email.trim(),
      password
    );
    if (error) {
      setCooldownSecs(60);
      if (alreadyRegistered) {
        showAlert(
          'Email Already Registered',
          'An account with this email already exists. Please tap "Already have an account? Sign In" below to sign in, or use "Forgot Password?" if you need to reset your password.'
        );
      } else {
        showAlert('Sign Up Failed', humanizeAuthError(error));
      }
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
    setIsVerifying(true);
    console.log('[SignUp] Verifying signup OTP for', email.trim());
    // Step 1: Verify the signup OTP. This confirms the email address and
    // creates a session. The password was already set atomically by
    // signUp() when we sent the OTP, so no updateUser is needed here.
    const { error } = await verifySignupOtpDirect(email.trim(), otp.trim());
    if (error) {
      setIsVerifying(false);
      console.warn('[SignUp] OTP verification failed:', error);
      showAlert('Verification Failed', humanizeVerifyError(error));
      return;
    }
    console.log('[SignUp] OTP verified — session established');

    // Step 2: Explicitly sign in with the password we set at signUp
    // time. This is a belt-and-suspenders step — it confirms the
    // password actually persisted, and fires a fresh SIGNED_IN event
    // that AppContext's onAuthStateChange subscription picks up. If
    // this fails we know the password wasn't saved and can guide the
    // user to reset it.
    console.log('[SignUp] Confirming sign-in with new password');
    const signInResult = await signInWithPasswordDirect(
      email.trim(),
      password
    );
    if (signInResult.error) {
      setIsVerifying(false);
      console.error(
        '[SignUp] Post-verification sign-in failed:',
        signInResult.error
      );
      showAlert(
        'Account Created',
        'Your account was created but we could not sign you in automatically. Please go back to the sign-in screen and log in with the password you just set. If it doesn\u2019t work, tap "Forgot Password?" to reset it.'
      );
      setMode('login');
      return;
    }

    // Step 3: Force AppContext to re-read the Supabase session so
    // currentUser flips from null to the new account BEFORE we
    // navigate. Without this, the app briefly renders the tabs in
    // "Guest" state — exactly the bug we're fixing.
    const authUser = await refreshAuthState();
    if (!authUser) {
      setIsVerifying(false);
      showAlert(
        'Sign In Required',
        'Your account was created. Please tap "Sign In" and log in with your new password.'
      );
      setMode('login');
      return;
    }
    console.log('[SignUp] currentUser updated, refreshing profile');

    // Step 4: Pull avatar + username (empty for brand-new accounts —
    // harmless, will just return no rows).
    try {
      await refreshProfile();
    } catch {
      /* non-fatal */
    }
    setIsVerifying(false);
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
                    cooldownSecs > 0 && styles.buttonDisabled,
                  ]}
                  onPress={handleForgotSendOTP}
                  disabled={cooldownSecs > 0}
                >
                  {cooldownSecs > 0 ? (
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
                    isResetting && styles.buttonDisabled,
                  ]}
                  onPress={handleResetPassword}
                  disabled={isResetting}
                >
                  {isResetting ? (
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
                    isVerifying && styles.buttonDisabled,
                  ]}
                  onPress={handleVerifyOTP}
                  disabled={isVerifying}
                >
                  {isVerifying ? (
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
                    (isSigningIn ||
                      (mode === 'register' && cooldownSecs > 0)) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={mode === 'login' ? handleLogin : handleSendOTP}
                  disabled={
                    isSigningIn ||
                    (mode === 'register' && cooldownSecs > 0)
                  }
                >
                  {isSigningIn ? (
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
              5 free searches per day included
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
