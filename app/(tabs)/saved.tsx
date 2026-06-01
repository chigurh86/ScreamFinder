import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../../constants/theme';
import { FREE_FAVORITES_LIMIT } from '../../constants/config';
import { useApp } from '../../contexts/AppContext';
import { useAlert } from '@/template';
import UpgradeModal from '../../components/feature/UpgradeModal';
import type { Movie } from '../../services/recommendationService';
import { FREE_DAILY_LIMIT } from '../../constants/config';
import { fetchPostersAndProviders } from '../../services/posterService';

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 30) return 'just now';
  if (diffMin < 1) return 'less than a minute ago';
  if (diffMin === 1) return '1 minute ago';
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHr === 1) return '1 hour ago';
  if (diffHr < 24) return `${diffHr} hours ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    savedMovies,
    removeSaved,
    clearAllSaved,
    updateSavedMovies,
    isSubscribed,
    favoritesRemaining,
    lastFavoritesRefresh,
    setLastFavoritesRefresh,
  } = useApp();
  const { showAlert } = useAlert();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);

  // Re-render every minute so the relative timestamp stays current
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (savedMovies.length === 0 || refreshing) return;
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await fetchPostersAndProviders(
        savedMovies.map((m) => ({
          title: m.title,
          year: m.year,
          type: m.type,
        })),
        { forceRefresh: true }
      );

      const updates: Record<string, Partial<Movie>> = {};
      for (const movie of savedMovies) {
        const update: Partial<Movie> = {};
        if (result.posters[movie.title]) {
          update.posterUrl = result.posters[movie.title];
        }
        if (result.providers[movie.title]) {
          update.streamingOn = result.providers[movie.title];
          update.verifiedStreaming = true;
        }
        if (Object.keys(update).length > 0) {
          updates[movie.title] = update;
        }
      }

      if (Object.keys(updates).length > 0) {
        updateSavedMovies(updates);
      }
      setLastFavoritesRefresh(Date.now());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.warn('Refresh error:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRefreshing(false);
    }
  }, [savedMovies, updateSavedMovies, refreshing, setLastFavoritesRefresh]);

  const handleRemove = useCallback(
    (movie: Movie) => {
      showAlert(
        'Remove from Saved',
        `Remove "${movie.title}" from your saved list?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              removeSaved(movie.title);
            },
          },
        ]
      );
    },
    [removeSaved, showAlert]
  );

  const handlePress = useCallback(
    (movie: Movie) => {
      Haptics.selectionAsync();
      router.push({
        pathname: '/movie-detail',
        params: { movieId: movie.id, movieJson: JSON.stringify(movie) },
      });
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Movie; index: number }) => (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <Pressable
          style={({ pressed }) => [
            styles.savedItem,
            pressed && styles.savedItemPressed,
          ]}
          onPress={() => handlePress(item)}
        >
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              style={styles.thumbnail}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Ionicons name={item.type === 'movie' ? 'film-outline' : 'tv-outline'} size={28} color={theme.textMuted} />
            </View>
          )}
          <View style={styles.itemContent}>
            <View style={styles.itemHeader}>
              <View style={styles.typeBadge}>
                <Ionicons
                  name={item.type === 'movie' ? 'film' : 'tv'}
                  size={10}
                  color={theme.accent}
                />
                <Text style={styles.typeText}>
                  {item.type === 'movie' ? 'Movie' : 'TV Show'}
                </Text>
              </View>
              <Text style={styles.yearText}>{item.year}</Text>
            </View>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.itemDescription} numberOfLines={2}>
              {item.description}
            </Text>
            <View style={styles.streamingRow}>
              {item.streamingOn.slice(0, 2).map((platform) => (
                <View key={platform} style={styles.platformBadge}>
                  <Text style={styles.platformText}>{platform}</Text>
                </View>
              ))}
              {item.streamingOn.length > 2 && (
                <Text style={styles.moreText}>+{item.streamingOn.length - 2}</Text>
              )}
            </View>
          </View>
          <Pressable
            style={styles.removeButton}
            onPress={() => handleRemove(item)}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={24} color={theme.textMuted} />
          </Pressable>
        </Pressable>
      </Animated.View>
    ),
    [handlePress, handleRemove]
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="heart" size={24} color={theme.primary} />
          <Text style={styles.headerTitle}>Saved Scares</Text>
        </View>
        <View style={styles.headerRight}>
          {savedMovies.length > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.removeAllButton, pressed && { opacity: 0.7 }]}
              onPress={() => {
                showAlert(
                  'Remove All Favorites',
                  `Are you sure you want to remove all ${savedMovies.length} saved titles?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove All',
                      style: 'destructive',
                      onPress: () => {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        clearAllSaved();
                      },
                    },
                  ]
                );
              }}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={16} color={theme.primary} />
              <Text style={styles.removeAllText}>All</Text>
            </Pressable>
          ) : null}
          <Text style={styles.countBadge}>
            {isSubscribed ? savedMovies.length : `${savedMovies.length}/${FREE_FAVORITES_LIMIT}`}
          </Text>
        </View>
      </View>

      {/* Favorites limit warning */}
      {!isSubscribed && savedMovies.length >= FREE_FAVORITES_LIMIT ? (
        <Pressable
          style={styles.limitBanner}
          onPress={() => setShowUpgrade(true)}
        >
          <Ionicons name="lock-closed" size={16} color={theme.primary} />
          <Text style={styles.limitBannerText}>
            Favorites limit reached. <Text style={styles.limitBannerLink}>Upgrade to Pro</Text> for unlimited.
          </Text>
        </Pressable>
      ) : !isSubscribed && savedMovies.length >= FREE_FAVORITES_LIMIT - 2 && savedMovies.length > 0 ? (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={16} color="#F59E0B" />
          <Text style={styles.warningBannerText}>
            {favoritesRemaining} {favoritesRemaining === 1 ? 'favorite' : 'favorites'} remaining on the free plan.
          </Text>
        </View>
      ) : null}

      {savedMovies.length === 0 ? (
        <View style={styles.emptyState}>
          <Image
            source={require('../../assets/images/empty-state.png')}
            style={styles.emptyImage}
            contentFit="cover"
          />
          <Text style={styles.emptyTitle}>No Saved Titles Yet</Text>
          <Text style={styles.emptySubtitle}>
            Heart a recommendation to save it for later!
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => router.push('/(tabs)/')}
          >
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.startButtonText}>Start Searching</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={savedMovies}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 16,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={
            <View style={styles.refreshTimestamp}>
              <Ionicons
                name={lastFavoritesRefresh ? 'time-outline' : 'arrow-down'}
                size={12}
                color={theme.textMuted}
              />
              <Text style={styles.refreshTimestampText}>
                {lastFavoritesRefresh
                  ? `Streaming updated ${formatRelativeTime(lastFavoritesRefresh)}`
                  : 'Pull down to refresh streaming'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
              progressBackgroundColor={theme.surface}
              title="Refreshing streaming..."
              titleColor={theme.textMuted}
            />
          }
        />
      )}
      <UpgradeModal
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dailyLimit={FREE_DAILY_LIMIT}
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  removeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },
  removeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
  },
  countBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
  },
  limitBannerText: {
    flex: 1,
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  limitBannerLink: {
    color: theme.primary,
    fontWeight: '700',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  warningBannerText: {
    flex: 1,
    fontSize: 13,
    color: theme.textSecondary,
  },
  savedItem: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  savedItemPressed: {
    borderColor: theme.primaryLight,
  },
  thumbnail: {
    width: 90,
    height: 130,
  },
  thumbnailPlaceholder: {
    backgroundColor: theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.accent,
  },
  yearText: {
    fontSize: 11,
    color: theme.textMuted,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  itemDescription: {
    fontSize: 12,
    color: theme.textSecondary,
    lineHeight: 17,
    marginBottom: 8,
  },
  streamingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  platformBadge: {
    backgroundColor: theme.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  platformText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  moreText: {
    fontSize: 10,
    color: theme.textMuted,
  },
  removeButton: {
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  refreshTimestamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  refreshTimestampText: {
    fontSize: 11,
    color: theme.textMuted,
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyImage: {
    width: 200,
    height: 260,
    borderRadius: 16,
    marginBottom: 24,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
