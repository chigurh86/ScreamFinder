import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { theme } from '../../constants/theme';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  requestSubscription,
  restorePurchases,
  finishTransaction,
  isIOSPlatform,
} from '../../services/iapService';
import { useApp } from '../../contexts/AppContext';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  dailyLimit: number;
}

export default function UpgradeModal({ visible, onClose, dailyLimit }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { showAlert } = useAlert();
  const { checkSubscription, iapInitialized, iapPricing } = useApp();
  const router = useRouter();

  const useAppleIAP = isIOSPlatform();

  // Apple IAP purchase flow
  const handleApplePurchase = async () => {
    setLoading(true);
    try {
      if (!iapInitialized) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showAlert('Store Unavailable', 'Could not connect to the App Store. Please try again later.');
        return;
      }

      const purchase = await requestSubscription();
      if (!purchase) {
        // User cancelled
        return;
      }

      // Verify receipt server-side
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('verify-apple-receipt', {
        body: {
          receiptData: purchase.transactionReceipt,
          productId: purchase.productId,
          transactionId: purchase.transactionId,
        },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const text = await error.context?.text();
            msg = text || msg;
          } catch { /* ignore */ }
        }
        throw new Error(msg);
      }

      // Finish the transaction with Apple
      await finishTransaction(purchase);

      // Refresh subscription status
      await checkSubscription();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert('Welcome to Pro!', 'Your subscription is now active. Enjoy unlimited searches and favorites.');
      onClose();
    } catch (e: any) {
      console.error('[IAP] Purchase error:', e);
      const errMsg = e?.message || 'Purchase failed. Please try again.';
      if (!errMsg.includes('cancel')) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showAlert('Purchase Failed', errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Stripe checkout flow (Android/Web)
  const handleStripeCheckout = async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('create-checkout');

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const text = await error.context?.text();
            msg = text || msg;
          } catch { /* ignore */ }
        }
        throw new Error(msg);
      }

      if (data?.url) {
        if (Platform.OS === 'web') {
          Linking.openURL(data.url);
        } else {
          await WebBrowser.openBrowserAsync(data.url);
        }
      }
    } catch (e: any) {
      console.error(e);
      const errMsg = e?.message || 'Could not start checkout. Please try again.';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (errMsg.toLowerCase().includes('already have an active subscription')) {
        showAlert('Already Subscribed', 'You already have an active subscription. Please restart the app to refresh your status.');
      } else {
        showAlert('Something went wrong', errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (useAppleIAP) {
      handleApplePurchase();
    } else {
      handleStripeCheckout();
    }
  };

  const handleRestorePurchases = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    try {
      const purchases = await restorePurchases();
      if (purchases.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showAlert('No Purchases Found', 'No previous Pro subscriptions were found for this Apple ID.');
        return;
      }
      const latest = purchases[0];
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('verify-apple-receipt', {
        body: {
          receiptData: latest.transactionReceipt,
          productId: latest.productId,
          transactionId: latest.transactionId,
        },
      });
      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try { const text = await error.context?.text(); msg = text || msg; } catch { /* ignore */ }
        }
        throw new Error(msg);
      }
      await finishTransaction(latest);
      await checkSubscription();
      if (data?.subscribed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert('Restored!', 'Your Pro subscription has been restored successfully.');
        onClose();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showAlert('Subscription Expired', 'Your previous subscription has expired. Please subscribe again.');
      }
    } catch (e: any) {
      console.error('[IAP] Restore error:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert('Restore Failed', e?.message || 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
          {/* Close button */}
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={theme.textMuted} />
          </Pressable>

          {/* Logo */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.logoContainer}>
            <Image
              source={require('../../assets/images/knife-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <Text style={styles.title}>{"You've Been Spooked!"}</Text>
            <Text style={styles.subtitle}>
              {"You've used all"} {dailyLimit} free searches for today. Upgrade to Pro for unlimited terrifying recommendations.
            </Text>
          </Animated.View>

          {/* Pro Plan Card */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.planCard}>
            <View style={styles.planHeader}>
              <Ionicons name="flash" size={20} color={theme.primary} />
              <Text style={styles.planName}>Pro Plan</Text>
            </View>
            <Text style={styles.planPrice}>
              {useAppleIAP && iapPricing ? iapPricing.monthlyEquivalent : '$2.50'}<Text style={styles.planPeriod}>/mo</Text>
            </Text>
            <Text style={styles.billedYearly}>Billed yearly at {useAppleIAP && iapPricing ? iapPricing.yearlyPrice : '$29.99'}</Text>
            <View style={styles.featuresList}>
              {['Unlimited searches', 'Priority recommendations', 'Early access to new features'].map((feature, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* CTA */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={{ gap: 10, width: '100%' }}>
            <Pressable
              style={({ pressed }) => [
                styles.upgradeButton,
                pressed && { opacity: 0.9 },
                loading && { opacity: 0.6 },
              ]}
              onPress={handleUpgrade}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.upgradeButtonText}>
                  {useAppleIAP ? 'Subscribe with Apple' : 'Upgrade Now'}
                </Text>
              )}
            </Pressable>

            {/* Apple-required subscription terms */}
            {useAppleIAP ? (
              <Text style={styles.appleTerms}>
                Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Your account will be charged {iapPricing ? iapPricing.yearlyPrice : '$29.99'} for renewal within 24 hours prior to the end of the current period. Manage subscriptions in your device Settings {'>'} Apple ID {'>'} Subscriptions.
              </Text>
            ) : null}

            {/* Restore Purchases - iOS only */}
            {useAppleIAP ? (
              <Pressable
                onPress={handleRestorePurchases}
                disabled={restoring}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.restoreText}>
                  {restoring ? 'Restoring...' : 'Restore Purchases'}
                </Text>
              </Pressable>
            ) : null}

            {/* Terms & Privacy links */}
            <View style={styles.legalLinks}>
              <Pressable onPress={() => { onClose(); setTimeout(() => router.push('/terms'), 300); }}>
                <Text style={styles.legalLinkText}>Terms of Use</Text>
              </Pressable>
              <Text style={styles.legalSeparator}>|</Text>
              <Pressable onPress={() => { onClose(); setTimeout(() => router.push('/privacy'), 300); }}>
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </Pressable>
            </View>

            <Pressable onPress={onClose}>
              <Text style={styles.laterText}>Maybe later</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
  },
  logoContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 50,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.primary,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  planCard: {
    width: '100%',
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    padding: 16,
    marginBottom: 20,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  planPeriod: {
    fontSize: 14,
    fontWeight: '400',
    color: theme.textMuted,
  },
  billedYearly: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginBottom: 4,
  },
  featuresList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  upgradeButton: {
    width: '100%',
    height: 50,
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  laterText: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
  },
  appleTerms: {
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 4,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  legalLinkText: {
    fontSize: 12,
    color: theme.textSecondary,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 12,
    color: theme.textMuted,
  },
  restoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
