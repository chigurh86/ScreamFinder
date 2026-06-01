import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { theme } from '../../constants/theme';
import { useApp } from '../../contexts/AppContext';
import type { Movie } from '../../services/recommendationService';

interface MovieCardProps {
  movie: Movie;
  onPress: () => void;
  onSaveLimitReached?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MovieCard({ movie, onPress, onSaveLimitReached }: MovieCardProps) {
  const { isSaved, toggleSave } = useApp();
  const saved = isSaved(movie.title);
  const heartScale = useSharedValue(1);

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleToggleSave = useCallback(() => {
    const wasSaved = saved;
    const success = toggleSave(movie);
    if (!success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onSaveLimitReached?.();
      return;
    }
    if (wasSaved) {
      // Unsaving - subtle light tick
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // Saving - satisfying success notification
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    heartScale.value = withSpring(1.4, { damping: 4 }, () => {
      heartScale.value = withSpring(1);
    });
  }, [movie, toggleSave, heartScale, onSaveLimitReached, saved]);

  const hasPoster = movie.posterUrl && movie.posterUrl.length > 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* Poster */}
      <View style={styles.posterContainer}>
        {hasPoster ? (
          <Image
            source={{ uri: movie.posterUrl as string }}
            style={styles.poster}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={styles.posterPlaceholder}>
            <Ionicons
              name={movie.type === 'movie' ? 'film-outline' : 'tv-outline'}
              size={36}
              color={theme.textMuted}
            />
            <Text style={styles.posterPlaceholderTitle} numberOfLines={3}>
              {movie.title}
            </Text>
          </View>
        )}

        {/* Heart Button */}
        <AnimatedPressable
          style={[styles.heartButton, heartStyle]}
          onPress={handleToggleSave}
          hitSlop={10}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={22}
            color={saved ? theme.primary : '#fff'}
          />
        </AnimatedPressable>

        {/* Type Badge */}
        <View style={styles.typeBadge}>
          <Ionicons
            name={movie.type === 'movie' ? 'film' : 'tv'}
            size={10}
            color={theme.accent}
          />
          <Text style={styles.typeText}>
            {movie.type === 'movie' ? 'Movie' : 'TV Show'}
          </Text>
        </View>

        {/* Match Percentage Badge */}
        {movie.matchPercent ? (
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>{movie.matchPercent}%</Text>
            <Text style={styles.matchLabel}>Match</Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {movie.title}
          </Text>
          <Text style={styles.year}>{movie.year}</Text>
        </View>
        <Text style={styles.description} numberOfLines={2}>
          {movie.description}
        </Text>
        <View style={styles.streamingRow}>
          {movie.streamingOn.slice(0, 2).map((platform) => (
            <View key={platform} style={[styles.platformBadge, movie.verifiedStreaming ? styles.platformBadgeVerified : undefined]}>
              {movie.verifiedStreaming ? (
                <View style={styles.verifiedDot} />
              ) : (
                <Ionicons
                  name="play-circle"
                  size={9}
                  color={theme.textSecondary}
                />
              )}
              <Text style={styles.platformText}>{platform}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardPressed: {
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },
  posterContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    position: 'relative',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  posterPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  posterPlaceholderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  matchBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 42,
  },
  matchText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 15,
  },
  matchLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.accent,
  },
  content: {
    padding: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  year: {
    fontSize: 12,
    color: theme.textMuted,
    marginLeft: 6,
  },
  description: {
    fontSize: 11,
    color: theme.textSecondary,
    lineHeight: 16,
    marginBottom: 8,
  },
  streamingRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.surfaceLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  platformBadgeVerified: {
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
  },
  platformText: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  verifiedDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.accent,
  },
});
