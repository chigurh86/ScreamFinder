import React, { useState } from 'react';
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
import { useAuth, useAlert } from '@/template';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../constants/theme';

type AuthMode = 'login' | 'register' | 'otp' | 'forgot' | 'resetPassword';

export default function LoginScreen() {
  const { sendOTP, verifyOTPAndLogin, signInWithPassword, operationLoading } =
    useAuth();
  const { showAlert } = useAlert();
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

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Missing Fields', 'Please enter both email and password.');
      return;
    }
    const { error } = await signInWithPassword(email.trim(), password);
    if (error) {
      showAlert('Sign In Failed', error);
    }
  };

  const handleForgotSendOTP = async () => {
    if (!email.trim()) {
      showAlert('Missing Email', 'Please enter your email address.');
      return;
    }
    const { error } = await sendOTP(email.trim());
    if (error) {
      showAlert('Error', error);
      return;
    }
    showAlert('Code Sent', 'A verification code has been sent to your email.');
    setOtp('');
    setNewPassword('');
    setConfirmNewPassword('');
    setMode('resetPassword');
  };

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
    const { error } = await verifyOTPAndLogin(email.trim(), otp.trim(), {
      password: newPassword,
    });
    if (error) {
      showAlert('Reset Failed', error);
    }
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
    const { error } = await sendOTP(email.trim());
    if (error) {
      showAlert('Error', error);
      return;
    }
    showAlert(
      'Code Sent',
      'A verification code has been sent to your email.'
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
    }
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
                    autoFocus
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    operationLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleForgotSendOTP}
                  disabled={operationLoading}
                >
                  {operationLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
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
                    operationLoading && styles.buttonDisabled,
                  ]}
                  onPress={handleResetPassword}
                  disabled={operationLoading}
                >
                  {operationLoading ? (
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
                    operationLoading && styles.buttonDisabled,
                  ]}
                  onPress={mode === 'login' ? handleLogin : handleSendOTP}
                  disabled={operationLoading}
                >
                  {operationLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
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
    paddingHorizontal: 18,
    height: 84,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 22,
    color: theme.textPrimary,
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
