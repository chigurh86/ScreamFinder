import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { theme } from '../constants/theme';
import { useApp } from '../contexts/AppContext';
import { STREAMING_COLORS, FREE_DAILY_LIMIT } from '../constants/config';
import UpgradeModal from '../components/feature/UpgradeModal';
import type { Movie } from '../services/recommendationService';

const { width } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MovieDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { movieJson } = useLocalSearchParams<{ movieJson: string }>();
  const { isSaved, toggleSave } = useApp();
  const heartScale = useSharedValue(1);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const movie = useMemo<Movie | null>(() => {
    try {
      return movieJson ? JSON.parse(movieJson) : null;
    } catch {
      return null;
    }
  }, [movieJson]);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  if (!movie) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Movie not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const saved = isSaved(movie.title);
  const hasPoster = movie.posterUrl && movie.posterUrl.length > 0;

  const handleToggleSave = () => {
    const wasSaved = saved;
    const success = toggleSave(movie);
    if (!success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setShowUpgrade(true);
      return;
    }
    if (wasSaved) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    heartScale.value = withSpring(1.5, { damping: 4 }, () => {
      heartScale.value = withSpring(1);
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image */}
        <Animated.View entering={FadeIn.duration(500)}>
          <View style={styles.heroContainer}>
            {hasPoster ? (
              <Image
                source={{ uri: movie.posterUrl as string }}
                style={styles.heroImage}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Ionicons
                  name={movie.type === 'movie' ? 'film-outline' : 'tv-outline'}
                  size={64}
                  color={theme.textMuted}
                />
                <Text style={styles.heroPlaceholderTitle}>{movie.title}</Text>
              </View>
            )}
            <View style={styles.heroOverlay} />

          </View>
        </Animated.View>

        {/* Close button - rendered outside hero so it stays on top across all platforms */}
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            { top: Math.max(insets.top, Platform.OS === 'web' ? 16 : 8) + 12 },
            pressed && styles.closeButtonPressed,
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={16}
          accessibilityLabel="Close movie details"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        {/* Content */}
        <View style={styles.contentContainer}>
          {/* Type Badge */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <View style={styles.typeBadge}>
              <Ionicons
                name={movie.type === 'movie' ? 'film' : 'tv'}
                size={12}
                color={theme.accent}
              />
              <Text style={styles.typeText}>
                {movie.type === 'movie' ? 'Movie' : 'TV Show'}
              </Text>
            </View>
          </Animated.View>

          {/* Title & Year */}
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <Text style={styles.title}>{movie.title}</Text>
            <Text style={styles.year}>{movie.year}</Text>
          </Animated.View>

          {/* Rating */}
          {movie.rating ? (
            <Animated.View
              entering={FadeInDown.delay(200).duration(400)}
              style={styles.ratingRow}
            >
              <Ionicons name="star" size={18} color="#FCD34D" />
              <Text style={styles.ratingValue}>{movie.rating}</Text>
              <Text style={styles.ratingLabel}>/10</Text>
            </Animated.View>
          ) : null}

          {/* Description */}
          <Animated.View entering={FadeInDown.delay(250).duration(400)}>
            <Text style={styles.sectionTitle}>Synopsis</Text>
            <Text style={styles.description}>{movie.description}</Text>
          </Animated.View>

          {/* Streaming */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <View style={styles.streamingHeader}>
              <Text style={styles.streamingSectionTitle}>Available On</Text>
              {movie.verifiedStreaming ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={12} color={theme.accent} />
                  <Text style={styles.verifiedBadgeText}>TMDB Verified</Text>
                </View>
              ) : (
                <View style={styles.unverifiedBadge}>
                  <Ionicons name="information-circle-outline" size={12} color={theme.textMuted} />
                  <Text style={styles.unverifiedBadgeText}>AI Suggested</Text>
                </View>
              )}
            </View>
            <View style={styles.streamingGrid}>
              {movie.streamingOn.map((platform) => (
                <Pressable
                  key={platform}
                  style={[
                    styles.streamingCard,
                    {
                      borderColor:
                        STREAMING_COLORS[platform] || theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="play-circle"
                    size={20}
                    color={
                      STREAMING_COLORS[platform] || theme.textSecondary
                    }
                  />
                  <Text style={styles.streamingName}>{platform}</Text>
                  <Ionicons
                    name="open-outline"
                    size={14}
                    color={theme.textMuted}
                  />
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Details section */}
          <Animated.View entering={FadeInDown.delay(350).duration(400)}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Type</Text>
                <Text style={styles.detailValue}>
                  {movie.type === 'movie' ? 'Feature Film' : 'TV Series'}
                </Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Year</Text>
                <Text style={styles.detailValue}>{movie.year}</Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Genre</Text>
                <Text style={styles.detailValue}>Horror</Text>
              </View>
              {movie.rating ? (
                <>
                  <View style={styles.detailDivider} />
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rating</Text>
                    <Text style={styles.detailValue}>
                      {movie.rating}/10
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </ScrollView>

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dailyLimit={FREE_DAILY_LIMIT}
      />

      {/* Sticky Bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <AnimatedPressable
          style={[
            styles.saveButton,
            saved && styles.saveButtonSaved,
            heartStyle,
          ]}
          onPress={handleToggleSave}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={22}
            color={saved ? '#fff' : theme.primary}
          />
          <Text
            style={[
              styles.saveButtonText,
              saved && styles.saveButtonTextSaved,
            ]}
          >
            {saved ? 'Saved' : 'Save to Favorites'}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  errorText: {
    fontSize: 18,
    color: theme.textPrimary,
    textAlign: 'center',
    marginTop: 100,
  },
  backLink: {
    fontSize: 16,
    color: theme.primary,
    textAlign: 'center',
    marginTop: 16,
  },
  heroContainer: {
    width: width,
    height: width * 1.2,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  heroPlaceholderTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.textSecondary,
    textAlign: 'center',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 15, 0.4)',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(13, 13, 13, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 10,
  },
  closeButtonPressed: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
    transform: [{ scale: 0.92 }],
  },
  contentContainer: {
    marginTop: -40,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: theme.background,
    paddingTop: 24,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 12,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.accent,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  year: {
    fontSize: 16,
    color: theme.textMuted,
    marginBottom: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  ratingValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FCD34D',
  },
  ratingLabel: {
    fontSize: 14,
    color: theme.textMuted,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 12,
    marginTop: 8,
  },
  description: {
    fontSize: 15,
    color: theme.textSecondary,
    lineHeight: 24,
    marginBottom: 20,
  },
  streamingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
  },
  streamingSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.accent,
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unverifiedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textMuted,
  },
  streamingGrid: {
    gap: 10,
    marginBottom: 20,
  },
  streamingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
  },
  streamingName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  detailsCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailDivider: {
    height: 1,
    backgroundColor: theme.border,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.primary,
    backgroundColor: 'transparent',
  },
  saveButtonSaved: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
  },
  saveButtonTextSaved: {
    color: '#fff',
  },
});
