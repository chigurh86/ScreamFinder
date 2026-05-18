import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '../constants/theme';

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Last Updated: May 12, 2026</Text>

        <Text style={styles.sectionTitle}>Introduction</Text>
        <Text style={styles.body}>
          ScreamFinder ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use the ScreamFinder mobile application.
        </Text>

        <Text style={styles.sectionTitle}>Information We Collect</Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Account Information:</Text> When you create an account, we collect your email address and password. We do not collect your real name unless you choose to provide it.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Usage Data:</Text> We track search queries and search frequency to enforce free-tier limits and improve recommendation quality. Search history is stored locally on your device and is not shared with third parties.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Saved Preferences:</Text> Movies you save to your favorites are stored locally on your device using AsyncStorage.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Profile Photos:</Text> If you upload a profile photo, it is stored securely in our cloud storage and associated with your account.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Subscription Data:</Text> If you subscribe to ScreamFinder Pro, we store subscription status information. Payment processing is handled entirely by Apple (for iOS) or Stripe (for Android/Web). We do not store or have access to your full payment details.
        </Text>

        <Text style={styles.sectionTitle}>How We Use Your Information</Text>
        <Text style={styles.body}>
          {'\u2022'} To provide personalized horror movie recommendations using AI{'\n'}
          {'\u2022'} To manage your account and subscription status{'\n'}
          {'\u2022'} To enforce usage limits on the free tier{'\n'}
          {'\u2022'} To improve our recommendation algorithm and service quality{'\n'}
          {'\u2022'} To display movie posters and streaming availability via TMDB
        </Text>

        <Text style={styles.sectionTitle}>Third-Party Services</Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Supabase:</Text> We use Supabase for authentication, database operations, and file storage. Your account data is stored securely on Supabase infrastructure.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>TMDB (The Movie Database):</Text> We use the TMDB API to retrieve movie posters, details, and streaming availability. No personal data is shared with TMDB.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>OnSpace AI:</Text> We use AI services to generate movie recommendations. Your search queries are sent to the AI service but are not permanently stored or used for training.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Apple App Store:</Text> On iOS, subscription payments are processed by Apple. Apple's privacy policy governs how they handle your payment information.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Stripe:</Text> On Android and Web, subscription payments are processed by Stripe. Stripe's privacy policy governs how they handle your payment information.
        </Text>

        <Text style={styles.sectionTitle}>Data Retention</Text>
        <Text style={styles.body}>
          Your account data is retained for as long as your account is active. Search usage data is retained on a daily basis for limit enforcement. You can request deletion of your account and all associated data by contacting us.
        </Text>

        <Text style={styles.sectionTitle}>Your Rights</Text>
        <Text style={styles.body}>
          {'\u2022'} Access your personal data stored in our systems{'\n'}
          {'\u2022'} Request correction of inaccurate information{'\n'}
          {'\u2022'} Request deletion of your account and associated data{'\n'}
          {'\u2022'} Export your saved movies and preferences{'\n'}
          {'\u2022'} Opt out of non-essential data collection
        </Text>

        <Text style={styles.sectionTitle}>Data Security</Text>
        <Text style={styles.body}>
          We implement industry-standard security measures including encrypted data transmission (TLS/SSL), secure authentication tokens, and row-level security policies on our database. However, no method of electronic transmission or storage is 100% secure.
        </Text>

        <Text style={styles.sectionTitle}>Children's Privacy</Text>
        <Text style={styles.body}>
          ScreamFinder is not intended for children under 17 due to horror content. We do not knowingly collect personal information from children under 17.
        </Text>

        <Text style={styles.sectionTitle}>Changes to This Policy</Text>
        <Text style={styles.body}>
          We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email.
        </Text>

        <Text style={styles.sectionTitle}>Contact Us</Text>
        <Text style={styles.body}>
          If you have questions about this Privacy Policy or wish to exercise your rights, please contact us at: support@screamfinder.app
        </Text>
      </ScrollView>
    </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  lastUpdated: {
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.textPrimary,
    marginTop: 24,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    color: theme.textSecondary,
    lineHeight: 24,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '700',
    color: theme.textPrimary,
  },
});
