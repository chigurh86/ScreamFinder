import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { pickAndUploadAvatar } from '../../services/avatarService';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { theme } from '../../constants/theme';
import { useApp } from '../../contexts/AppContext';
import {
  requestSubscription,
  restorePurchases,
  finishTransaction,
  isIOSPlatform,
} from '../../services/iapService';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { showAlert } = useAlert();
  const {
    savedMovies,
    remainingSearches,
    searchHistory,
    isSubscribed,
    subscriptionEnd,
    subscriptionSource,
    checkSubscription,
    iapInitialized,
    iapPricing,
    avatarUrl,
    setAvatarUrl,
    profileName,
  } = useApp();

  const [portalLoading, setPortalLoading] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [restoringPurchases, setRestoringPurchases] = useState(false);
  const [iapLoading, setIapLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const useAppleIAP = isIOSPlatform();
  const isGuest = !user;

  const handleSignInPrompt = () => {
    Haptics.selectionAsync();
    router.push('/login');
  };

  const handleChangePhoto = async () => {
    if (!user) {
      handleSignInPrompt();
      return;
    }
    setAvatarLoading(true);
    try {
      const url = await pickAndUploadAvatar(user.id);
      if (url) {
        setAvatarUrl(url);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: any) {
      showAlert('Upload Failed', e?.message || 'Could not upload photo.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshingStatus(true);
    await checkSubscription();
    setTimeout(() => setRefreshingStatus(false), 800);
  };

  const handleManageSubscription = async () => {
    if (subscriptionSource === 'apple') {
      // Open Apple subscription management
      Linking.openURL('https://apps.apple.com/account/subscriptions');
      return;
    }

    // Stripe customer portal
    setPortalLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('customer-portal');
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
      showAlert('Error', 'Could not open subscription portal.');
    } finally {
      setPortalLoading(false);
    }
  };

  // Apple IAP purchase from profile page
  const handleApplePurchase = async () => {
    setIapLoading(true);
    try {
      if (!iapInitialized) {
        showAlert('Store Unavailable', 'Could not connect to the App Store. Please try again later.');
        return;
      }

      const purchase = await requestSubscription();
      if (!purchase) return; // User cancelled

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

      await finishTransaction(purchase);
      await checkSubscription();
      showAlert('Welcome to Pro!', 'Your subscription is now active.');
    } catch (e: any) {
      console.error('[IAP] Purchase error:', e);
      const errMsg = e?.message || 'Purchase failed.';
      if (!errMsg.includes('cancel')) {
        showAlert('Purchase Failed', errMsg);
      }
    } finally {
      setIapLoading(false);
    }
  };

  // Stripe checkout from profile page
  const handleStripeCheckout = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('create-checkout');
      if (error) throw error;
      if (data?.url) {
        if (Platform.OS === 'web') {
          Linking.openURL(data.url);
        } else {
          await WebBrowser.openBrowserAsync(data.url);
        }
      }
    } catch (e: any) {
      console.error(e);
      const errMsg = e?.message || 'Could not start checkout.';
      if (errMsg.toLowerCase().includes('already have an active subscription')) {
        showAlert('Already Subscribed', 'You already have an active subscription. Please restart the app to refresh your status.');
        checkSubscription();
      } else {
        showAlert('Error', errMsg);
      }
    }
  };

  // Restore purchases (iOS only)
  const handleRestorePurchases = async () => {
    setRestoringPurchases(true);
    try {
      const purchases = await restorePurchases();
      if (purchases.length === 0) {
        showAlert('No Purchases Found', 'No previous Pro subscriptions were found for this Apple ID.');
        setRestoringPurchases(false);
        return;
      }

      // Verify the most recent purchase
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
          try {
            const text = await error.context?.text();
            msg = text || msg;
          } catch { /* ignore */ }
        }
        throw new Error(msg);
      }

      await finishTransaction(latest);
      await checkSubscription();

      if (data?.subscribed) {
        showAlert('Restored!', 'Your Pro subscription has been restored successfully.');
      } else {
        showAlert('Subscription Expired', 'Your previous subscription has expired. Please subscribe again to continue with Pro.');
      }
    } catch (e: any) {
      console.error('[IAP] Restore error:', e);
      showAlert('Restore Failed', e?.message || 'Could not restore purchases. Please try again.');
    } finally {
      setRestoringPurchases(false);
    }
  };

  const handleSignOut = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const { error } = await logout();
    if (error) {
      showAlert('Error', error);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/knife-logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </View>

        {/* Profile Card */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.profileCard}>
          <Pressable
            onPress={handleChangePhoto}
            disabled={avatarLoading}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}
          >
            <View style={styles.avatarCircle}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <Ionicons name="person" size={36} color={theme.textMuted} />
              )}
              <View style={styles.cameraBadge}>
                {avatarLoading ? (
                  <ActivityIndicator size={10} color="#fff" />
                ) : (
                  <Ionicons name="camera" size={12} color="#fff" />
                )}
              </View>
            </View>
          </Pressable>
          <Text style={styles.profileName}>
            {isGuest
              ? 'Guest'
              : (user?.username || profileName || user?.email?.split('@')[0] || 'Horror Fan')}
          </Text>
          <Text style={styles.profileEmail}>
            {isGuest ? 'Sign in to sync favorites across devices' : user?.email}
          </Text>
          <View
            style={[
              styles.planBadge,
              isSubscribed && styles.planBadgePro,
            ]}
          >
            <Ionicons
              name="flash"
              size={14}
              color={isSubscribed ? theme.primary : theme.accent}
            />
            <Text
              style={[
                styles.planText,
                isSubscribed && styles.planTextPro,
              ]}
            >
              {isSubscribed ? 'Pro Plan' : 'Free Plan'}
            </Text>
          </View>
        </Animated.View>

        {/* Guest sign-in CTA */}
        {isGuest ? (
          <Animated.View entering={FadeInDown.delay(25).duration(400)}>
            <Pressable
              style={({ pressed }) => [
                styles.guestCard,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleSignInPrompt}
            >
              <View style={styles.guestLeft}>
                <View style={styles.guestIconCircle}>
                  <Ionicons name="log-in-outline" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guestTitle}>Sign in or create an account</Text>
                  <Text style={styles.guestSubtitle}>
                    Sync favorites, unlock Pro, and access from any device.
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Subscription Card - hidden for guests */}
        {!isGuest ? (
        <Animated.View
          entering={FadeInDown.delay(50).duration(400)}
          style={styles.subscriptionCard}
        >
          <View style={styles.subHeader}>
            <View style={styles.subHeaderLeft}>
              <Ionicons
                name="flash"
                size={20}
                color={isSubscribed ? theme.primary : theme.textMuted}
              />
              <View>
                <Text style={styles.subTitle}>
                  {isSubscribed ? 'Pro Plan' : 'Free Plan'}
                </Text>
                <Text style={styles.subEmail}>{user?.email}</Text>
              </View>
            </View>
            {isSubscribed ? (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>
                  {subscriptionSource === 'apple' ? 'Apple' : 'Active'}
                </Text>
              </View>
            ) : null}
          </View>
          {isSubscribed && subscriptionEnd ? (
            <Text style={styles.renewText}>
              Renews on {new Date(subscriptionEnd).toLocaleDateString()}
            </Text>
          ) : null}
          <View style={styles.subActions}>
            {isSubscribed ? (
              <Pressable
                style={({ pressed }) => [
                  styles.manageButton,
                  pressed && { opacity: 0.7 },
                  portalLoading && { opacity: 0.5 },
                ]}
                onPress={handleManageSubscription}
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <ActivityIndicator size="small" color={theme.textPrimary} />
                ) : (
                  <Ionicons
                    name={subscriptionSource === 'apple' ? 'logo-apple' : 'card-outline'}
                    size={18}
                    color={theme.textSecondary}
                  />
                )}
                <Text style={styles.manageButtonText}>
                  {subscriptionSource === 'apple' ? 'Manage in Settings' : 'Manage Subscription'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.refreshButton,
                pressed && { opacity: 0.7 },
                refreshingStatus && { opacity: 0.5 },
              ]}
              onPress={handleRefreshStatus}
              disabled={refreshingStatus}
            >
              {refreshingStatus ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <Ionicons name="refresh" size={16} color={theme.textSecondary} />
              )}
              <Text style={styles.refreshButtonText}>Refresh Status</Text>
            </Pressable>
          </View>
        </Animated.View>
        ) : null}

        {/* Restore Purchases - iOS only */}
        {useAppleIAP ? (
          <Animated.View entering={FadeInDown.delay(75).duration(400)} style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <Pressable
              style={({ pressed }) => [
                styles.restoreButton,
                pressed && { opacity: 0.7 },
                restoringPurchases && { opacity: 0.5 },
              ]}
              onPress={handleRestorePurchases}
              disabled={restoringPurchases}
            >
              {restoringPurchases ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <Ionicons name="arrow-undo" size={16} color={theme.textSecondary} />
              )}
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Stats Row */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{savedMovies.length}</Text>
            <Text style={styles.statLabel}>Saved</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {isSubscribed ? '\u221E' : String(remainingSearches)}
            </Text>
            <Text style={styles.statLabel}>Searches Left</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{searchHistory.length}</Text>
            <Text style={styles.statLabel}>Searches</Text>
          </View>
        </Animated.View>

        {/* Upgrade Card (only if not subscribed) */}
        {!isSubscribed ? (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <Pressable
              style={({ pressed }) => [
                styles.upgradeCard,
                pressed && { opacity: 0.9 },
                iapLoading && { opacity: 0.6 },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (isGuest) {
                  handleSignInPrompt();
                  return;
                }
                if (useAppleIAP) {
                  handleApplePurchase();
                } else {
                  handleStripeCheckout();
                }
              }}
              disabled={iapLoading}
            >
              <View style={styles.upgradeLeft}>
                <View style={styles.upgradeIconCircle}>
                  {iapLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons
                      name={useAppleIAP ? 'logo-apple' : 'flash'}
                      size={24}
                      color="#FFF"
                    />
                  )}
                </View>
                <View>
                  <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
                  <Text style={styles.upgradeSubtitle}>
                    {useAppleIAP ? 'Subscribe via App Store' : 'Unlimited searches & favorites'}
                  </Text>
                </View>
              </View>
              <View style={styles.priceTag}>
                <Text style={styles.priceText}>{useAppleIAP && iapPricing ? iapPricing.monthlyEquivalent : '$2.50'}</Text>
                <Text style={styles.priceUnit}>/mo</Text>
              </View>
            </Pressable>
            {/* Apple-required subscription terms */}
            {useAppleIAP ? (
              <Text style={styles.appleTerms}>
                Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews at {iapPricing ? iapPricing.yearlyPrice : '$29.99'}/year unless canceled at least 24 hours before the end of the current period. Manage subscriptions in Settings {'>'} Apple ID {'>'} Subscriptions.
              </Text>
            ) : (
              <Text style={styles.billedNote}>Billed yearly at $29.99</Text>
            )}
          </Animated.View>
        ) : null}

        {/* Pro Features */}
        {!isSubscribed ? (
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.featuresCard}>
            <Text style={styles.featuresTitle}>Pro Benefits</Text>
            {[
              { icon: 'infinite' as const, text: 'Unlimited daily searches' },
              { icon: 'heart' as const, text: 'Unlimited saved favorites' },
              { icon: 'star' as const, text: 'Priority recommendations' },
              { icon: 'rocket' as const, text: 'Early access to new features' },
            ].map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureIconBg}>
                  <Ionicons name={feature.icon} size={16} color={theme.accent} />
                </View>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
            ))}
          </Animated.View>
        ) : null}

        {/* Search History */}
        {searchHistory.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.historyCard}>
            <Text style={styles.historyTitle}>Recent Searches</Text>
            {searchHistory.slice(0, 5).map((q, i) => (
              <View key={i} style={styles.historyRow}>
                <Ionicons name="time" size={16} color={theme.textMuted} />
                <Text style={styles.historyText}>{q}</Text>
              </View>
            ))}
          </Animated.View>
        ) : null}

        {/* Settings */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.settingsCard}>
          {[
            { icon: 'moon-outline' as const, label: 'Dark Mode', hasChevron: false, extra: 'Always On', route: '' },
            { icon: 'document-text-outline' as const, label: 'Terms of Use', hasChevron: true, extra: '', route: '/terms' },
            { icon: 'shield-checkmark-outline' as const, label: 'Privacy Policy', hasChevron: true, extra: '', route: '/privacy' },
            { icon: 'help-circle-outline' as const, label: 'Help & Support', hasChevron: true, extra: '', route: '' },
          ].map((item, i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.settingsRow,
                i < 3 && styles.settingsRowBorder,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                if (item.route) router.push(item.route as any);
              }}
            >
              <View style={styles.settingsLeft}>
                <Ionicons name={item.icon} size={20} color={theme.textSecondary} />
                <Text style={styles.settingsLabel}>{item.label}</Text>
              </View>
              {item.hasChevron ? (
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              ) : (
                <Text style={styles.settingsExtra}>{item.extra}</Text>
              )}
            </Pressable>
          ))}
        </Animated.View>

        {/* Sign Out / Sign In */}
        <Animated.View entering={FadeInDown.delay(450).duration(400)}>
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={isGuest ? handleSignInPrompt : handleSignOut}
          >
            <Ionicons
              name={isGuest ? 'log-in-outline' : 'log-out-outline'}
              size={20}
              color={theme.primary}
            />
            <Text style={styles.signOutText}>
              {isGuest ? 'Sign In' : 'Sign Out'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* TMDB Attribution */}
        <View style={styles.tmdbAttribution}>
          <Image
            source={{ uri: 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg' }}
            style={styles.tmdbLogo}
            contentFit="contain"
          />
          <Text style={styles.tmdbText}>
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </Text>
        </View>

        {/* Version */}
        <Text style={styles.versionText}>ScreamFinder v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: {
    width: 152,
    height: 38,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.primary,
    letterSpacing: 1,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.surface,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.background,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 12,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  planBadgePro: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderColor: 'rgba(220, 38, 38, 0.2)',
  },
  planText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.accent,
  },
  planTextPro: {
    color: theme.primary,
  },
  subscriptionCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  subEmail: {
    fontSize: 12,
    color: theme.textMuted,
  },
  activeBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  renewText: {
    fontSize: 11,
    color: theme.textMuted,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.surfaceLight,
    borderRadius: theme.radius.md,
    alignSelf: 'flex-start',
  },
  manageButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  subActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.surfaceLight,
    borderRadius: theme.radius.md,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  restoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  upgradeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upgradeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  upgradeSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  priceTag: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceText: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.primary,
  },
  priceUnit: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  featuresCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  featureIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  historyCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 14,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  historyText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  settingsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsLabel: {
    fontSize: 15,
    color: theme.textPrimary,
  },
  settingsExtra: {
    fontSize: 13,
    color: theme.textMuted,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.primary,
  },
  tmdbAttribution: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 16,
    gap: 8,
  },
  tmdbLogo: {
    width: 120,
    height: 20,
  },
  tmdbText: {
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 8,
    marginBottom: 16,
  },
  appleTerms: {
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 15,
    marginHorizontal: 16,
    marginTop: 8,
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  guestLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guestIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  guestSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  billedNote: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginHorizontal: 16,
    marginTop: 6,
  },
});
