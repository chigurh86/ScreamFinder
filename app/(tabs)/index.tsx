import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { theme } from '../../constants/theme';
import { FREE_DAILY_LIMIT } from '../../constants/config';
import { useApp } from '../../contexts/AppContext';
import { fetchRecommendations, enrichWithPosters } from '../../services/recommendationService';
import type { Movie } from '../../services/recommendationService';
import MovieCard from '../../components/feature/MovieCard';
import UpgradeModal from '../../components/feature/UpgradeModal';
import { fetchPosters, fetchPostersAndProviders } from '../../services/posterService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

/**
 * Parses a year from the end of a search query.
 * Supports: "Hereditary 2018", "The Shining (1980)", "Scream 1996"
 */
function parseQueryAndYear(input: string): { title: string; year: number | null } {
  const trimmed = input.trim();
  const match = trimmed.match(/^(.+?)\s*\(?(\d{4})\)?$/);
  if (match) {
    const potentialYear = parseInt(match[2], 10);
    if (potentialYear >= 1900 && potentialYear <= new Date().getFullYear() + 1) {
      return { title: match[1].trim(), year: potentialYear };
    }
  }
  return { title: trimmed, year: null };
}

function ShimmerBlock({ style }: { style?: any }) {
  const opacity = useSharedValue(0.4);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { backgroundColor: theme.surfaceLight, borderRadius: 4 },
        style,
        animStyle,
      ]}
    />
  );
}

const SUGGESTIONS_POOL = [
  { title: 'Hereditary', year: 2018, type: 'movie' as const },
  { title: 'The Conjuring', year: 2013, type: 'movie' as const },
  { title: 'Stranger Things', year: 2016, type: 'tv' as const },
  { title: 'Midsommar', year: 2019, type: 'movie' as const },
  { title: 'Get Out', year: 2017, type: 'movie' as const },
  { title: 'A Quiet Place', year: 2018, type: 'movie' as const },
  { title: 'The Witch', year: 2015, type: 'movie' as const },
  { title: 'It Follows', year: 2014, type: 'movie' as const },
  { title: 'The Babadook', year: 2014, type: 'movie' as const },
  { title: 'Suspiria', year: 1977, type: 'movie' as const },
  { title: 'The Thing', year: 1982, type: 'movie' as const },
  { title: 'Rosemary\'s Baby', year: 1968, type: 'movie' as const },
  { title: 'The Texas Chain Saw Massacre', year: 1974, type: 'movie' as const },
  { title: 'Scream', year: 1996, type: 'movie' as const },
  { title: 'The Shining', year: 1980, type: 'movie' as const },
  { title: 'Paranormal Activity', year: 2007, type: 'movie' as const },
  { title: 'Insidious', year: 2010, type: 'movie' as const },
  { title: 'The Exorcist', year: 1973, type: 'movie' as const },
  { title: 'Nightmare on Elm Street', year: 1984, type: 'movie' as const },
  { title: 'Us', year: 2019, type: 'movie' as const },
  { title: 'Talk to Me', year: 2023, type: 'movie' as const },
  { title: 'Pearl', year: 2022, type: 'movie' as const },
  { title: 'Barbarian', year: 2022, type: 'movie' as const },
  { title: 'Nope', year: 2022, type: 'movie' as const },
];

const SUGGESTION_COUNT = 6;

function getRandomSuggestions() {
  const shuffled = [...SUGGESTIONS_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, SUGGESTION_COUNT);
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    addSearchHistory,
    remainingSearches,
    isAtLimit,
    decrementSearches,
    isSubscribed,
    savedMovies,
  } = useApp();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchedTitle, setSearchedTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);
  const [suggestionPosters, setSuggestionPosters] = useState<Record<string, string>>({});
  const [searchedPoster, setSearchedPoster] = useState<string | null>(null);
  const [searchedYear, setSearchedYear] = useState<number | null>(null);
  const [searchedProviders, setSearchedProviders] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState(() => getRandomSuggestions());

  useEffect(() => {
    fetchPosters(suggestions).then((posters) => {
      setSuggestionPosters(posters);
    });
  }, [suggestions]);

  const doSearch = useCallback(
    async (title: string, specifiedYear?: number | null) => {
      if (isAtLimit) {
        setShowUpgrade(true);
        return;
      }

      setIsLoading(true);
      setSearchedTitle(title);
      setSearchedPoster(null);
      setSearchedYear(specifiedYear || null);
      setSearchedProviders([]);
      setResults([]);
      setErrorMessage('');
      addSearchHistory(title);
      await decrementSearches();

      // Fetch poster and streaming providers for the searched title itself
      fetchPostersAndProviders([{ title, year: specifiedYear || new Date().getFullYear(), type: 'movie' }]).then((result) => {
        if (result.posters[title]) setSearchedPoster(result.posters[title]);
        if (result.providers[title]) setSearchedProviders(result.providers[title]);
      });

      // Exclude already-saved favorites so we don't re-recommend them
      const savedTitles = savedMovies.map((m) => m.title);
      const savedTitlesLower = new Set(savedTitles.map((t) => t.toLowerCase()));

      const { data, error, inputYear } = await fetchRecommendations(title, savedTitles, specifiedYear);
      if (error) {
        setErrorMessage(error);
      } else if (data) {
        if (inputYear) setSearchedYear(inputYear);
        // Client-side safety net: filter out anything still matching a saved title
        const filtered = data.filter((m) => !savedTitlesLower.has(m.title.toLowerCase()));
        setResults(filtered);
        enrichWithPosters(filtered).then((enriched) => setResults(enriched));
      }
      setIsLoading(false);
    },
    [addSearchHistory, decrementSearches, isAtLimit, savedMovies]
  );

  const handleRefresh = useCallback(async () => {
    if (!searchedTitle || isLoading) return;
    setRefreshing(true);
    const savedTitles = savedMovies.map((m) => m.title);
    const savedTitlesLower = new Set(savedTitles.map((t) => t.toLowerCase()));
    const { data } = await fetchRecommendations(searchedTitle, savedTitles);
    if (data) {
      const filtered = data.filter((m) => !savedTitlesLower.has(m.title.toLowerCase()));
      setResults(filtered);
      enrichWithPosters(filtered).then((enriched) => setResults(enriched));
    }
    setRefreshing(false);
  }, [searchedTitle, isLoading, savedMovies]);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Parse year from main query (e.g. "Hereditary 2018" or "The Shining (1980)")
    const parsed = parseQueryAndYear(query);

    const finalTitle = parsed.year ? parsed.title : query.trim();
    const finalYear = parsed.year;

    doSearch(finalTitle, finalYear);
  }, [query, doSearch]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !searchedTitle || isLoading) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);

    const existingTitles = results.map((m) => m.title);
    const savedTitles = savedMovies.map((m) => m.title);
    const savedTitlesLower = new Set(savedTitles.map((t) => t.toLowerCase()));
    // Combine existing results + saved favorites for exclusion (deduped)
    const excludeList = Array.from(new Set([...existingTitles, ...savedTitles]));
    const { data } = await fetchRecommendations(searchedTitle, excludeList);
    if (data) {
      const filtered = data.filter((m) => !savedTitlesLower.has(m.title.toLowerCase()));
      setResults((prev) => [...prev, ...filtered]);
      enrichWithPosters(filtered).then((enriched) => {
        setResults((prev) => {
          const enrichedMap = new Map(enriched.map((m) => [m.id, m]));
          return prev.map((m) => enrichedMap.get(m.id) || m);
        });
      });
    }
    setIsLoadingMore(false);
    loadingMoreRef.current = false;
  }, [searchedTitle, results, isLoading, savedMovies]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < 300 && results.length > 0 && !isLoading) {
        handleLoadMore();
      }
    },
    [handleLoadMore, results.length, isLoading]
  );

  const handleMoviePress = useCallback(
    (movie: Movie) => {
      Haptics.selectionAsync();
      router.push({
        pathname: '/movie-detail',
        params: {
          movieId: movie.id,
          movieJson: JSON.stringify(movie),
        },
      });
    },
    [router]
  );

  const handleSaveLimitReached = useCallback(() => {
    setShowUpgrade(true);
  }, []);

  const handleReset = useCallback(() => {
    setResults([]);
    setSearchedTitle('');
    setSearchedPoster(null);
    setSearchedYear(null);
    setSearchedProviders([]);
    setQuery('');
    setErrorMessage('');
    // Randomize suggestions on reset
    const newSuggestions = getRandomSuggestions();
    setSuggestions(newSuggestions);
    setSuggestionPosters({});
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={200}
        refreshControl={
          searchedTitle.length > 0 && !isLoading ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
              progressBackgroundColor={theme.surface}
            />
          ) : undefined
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleReset} style={styles.logoRow}>
            <Image
              source={require('../../assets/images/knife-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </Pressable>
        </View>

        {/* Hero Section */}
        {!searchedTitle && !isLoading ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.hero}>
            <Image
              source={require('../../assets/images/spooky-eyes.png')}
              style={styles.spookyEyes}
              contentFit="contain"
            />
            <Text style={styles.heroTitle}>What Haunts You?</Text>
            <Text style={styles.heroSubtitle}>
              Enter a movie or TV show and we will summon terrifying
              recommendations.
            </Text>
          </Animated.View>
        ) : null}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchRow}>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="search"
                size={20}
                color={theme.textMuted}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="e.g. The Shining 1980"
                placeholderTextColor={theme.textMuted}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={handleReset}
                  hitSlop={8}
                  style={styles.clearButton}
                >
                  <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.searchButton,
                pressed && styles.searchButtonPressed,
                isLoading && styles.searchButtonDisabled,
              ]}
              onPress={handleSearch}
              disabled={isLoading || !query.trim()}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.searchButtonText}>Find Scares</Text>
              )}
            </Pressable>
          </View>
          {!isLoading && !searchedTitle ? (
            <Text style={styles.remainingText}>
              {isSubscribed
                ? 'Pro \u2014 Unlimited searches'
                : `${remainingSearches} free ${remainingSearches === 1 ? 'search' : 'searches'} remaining today`}
            </Text>
          ) : null}
        </View>

        {/* Error message */}
        {errorMessage ? (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={20} color={theme.primary} />
            <Text style={styles.errorText}>
              Could not fetch recommendations. Please try again.
            </Text>
          </View>
        ) : null}

        {/* Searched For Card */}
        {searchedTitle.length > 0 && !isLoading && results.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.searchedForSection}>
            <Text style={styles.searchedForLabel}>You searched for</Text>
            <Pressable
              style={({ pressed }) => [styles.searchedForCard, pressed && styles.searchedForCardPressed]}
              onPress={() => {
                Haptics.selectionAsync();
                const searchedMovie: Movie = {
                  id: `searched_${Date.now()}`,
                  title: searchedTitle,
                  year: searchedYear || new Date().getFullYear(),
                  description: 'Your original search title.',
                  type: 'movie',
                  streamingOn: searchedProviders,
                  posterUrl: searchedPoster,
                };
                router.push({
                  pathname: '/movie-detail',
                  params: {
                    movieId: searchedMovie.id,
                    movieJson: JSON.stringify(searchedMovie),
                  },
                });
              }}
            >
              {searchedPoster ? (
                <Image
                  source={{ uri: searchedPoster }}
                  style={styles.searchedForPoster}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={styles.searchedForPosterPlaceholder}>
                  <Ionicons name="film" size={22} color={theme.textMuted} />
                </View>
              )}
              <View style={styles.searchedForContent}>
                <Text style={styles.searchedForTitle} numberOfLines={1}>{searchedTitle}</Text>
                <Text style={styles.searchedForSubtitle}>Horror{searchedYear ? ` · ${searchedYear}` : ''} · Original Search</Text>
                {searchedProviders.length > 0 ? (
                  <View style={styles.searchedForProviders}>
                    <Ionicons name="play-circle" size={11} color={theme.accent} />
                    <Text style={styles.searchedForProviderText} numberOfLines={1}>
                      {searchedProviders.slice(0, 3).join(' · ')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.searchedForArrow}>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </View>
            </Pressable>
            <Text style={styles.resultsHeader}>
              Similar titles you might enjoy...
            </Text>
          </Animated.View>
        ) : null}

        {/* Loading Skeletons */}
        {isLoading ? (
          <View style={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Animated.View
                key={`skel-${i}`}
                entering={FadeInDown.delay(i * 80).duration(300)}
                style={styles.skeletonCard}
              >
                <ShimmerBlock style={styles.skeletonPoster} />
                <View style={styles.skeletonContent}>
                  <ShimmerBlock style={[styles.skeletonLine, { width: '80%' }]} />
                  <ShimmerBlock style={[styles.skeletonLine, { width: '40%', height: 10 }]} />
                  <ShimmerBlock style={[styles.skeletonLine, { width: '100%', height: 8, marginTop: 8 }]} />
                  <ShimmerBlock style={[styles.skeletonLine, { width: '70%', height: 8 }]} />
                </View>
              </Animated.View>
            ))}
          </View>
        ) : null}

        {/* Results Grid */}
        {!isLoading && results.length > 0 ? (
          <View style={styles.grid}>
            {results.map((movie, index) => (
              <Animated.View
                key={movie.id}
                entering={FadeInDown.delay(index * 60).duration(400)}
                style={{ width: CARD_WIDTH }}
              >
                <MovieCard
                  movie={movie}
                  onPress={() => handleMoviePress(movie)}
                  onSaveLimitReached={handleSaveLimitReached}
                />
              </Animated.View>
            ))}
          </View>
        ) : null}

        {/* Loading More Indicator */}
        {isLoadingMore ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.loadingMoreText}>Summoning more scares...</Text>
          </View>
        ) : null}

        {/* Suggestion Cards when no results */}
        {!isLoading && !searchedTitle ? (
          <View style={styles.suggestionsSection}>
            <Text style={styles.suggestionsLabel}>Try one of these</Text>
            <View style={styles.suggestionsGrid}>
              {suggestions.map((item) => (
                <Pressable
                  key={item.title}
                  style={({ pressed }) => [
                    styles.suggestionCard,
                    pressed && styles.suggestionCardPressed,
                  ]}
                  onPress={() => {
                    setQuery(`${item.title} ${item.year}`);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    doSearch(item.title, item.year);
                  }}
                >
                  {suggestionPosters[item.title] ? (
                    <Image
                      source={{ uri: suggestionPosters[item.title] }}
                      style={styles.suggestionPoster}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={styles.suggestionPlaceholder}>
                      <Ionicons name="film" size={24} color={theme.textMuted} />
                    </View>
                  )}
                  <View style={styles.suggestionContent}>
                    <Text style={styles.suggestionTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Upgrade Modal */}
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
    paddingVertical: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 168,
    height: 42,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.primary,
    letterSpacing: 1,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  spookyEyes: {
    width: 180,
    height: 100,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
  },
  searchRow: {
    flexDirection: 'column',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 16,
    height: 72,
  },
  searchIcon: {
    marginRight: 12,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: theme.textPrimary,
    fontSize: 19,
    paddingLeft: 4,
    paddingVertical: 0,
  },

  searchButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    height: 64,
  },
  searchButtonPressed: {
    backgroundColor: theme.primaryDark,
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  remainingText: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 10,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: theme.textSecondary,
  },
  searchedForSection: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  searchedForLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  searchedForCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    overflow: 'hidden',
    height: 68,
  },
  searchedForCardPressed: {
    opacity: 0.8,
    borderColor: 'rgba(220, 38, 38, 0.5)',
  },
  searchedForPoster: {
    width: 48,
    height: 68,
  },
  searchedForPosterPlaceholder: {
    width: 48,
    height: 68,
    backgroundColor: theme.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchedForContent: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 1,
  },
  searchedForProviders: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  searchedForProviderText: {
    fontSize: 11,
    color: theme.accent,
    fontWeight: '600',
  },
  searchedForTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  searchedForSubtitle: {
    fontSize: 12,
    color: theme.textMuted,
  },
  searchedForArrow: {
    paddingRight: 14,
  },
  resultsHeader: {
    fontSize: 15,
    color: theme.textSecondary,
    paddingTop: 14,
    paddingBottom: 12,
    fontStyle: 'italic',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 16,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  skeletonPoster: {
    width: '100%',
    height: CARD_WIDTH * 1.4,
    borderRadius: 0,
  },
  skeletonContent: {
    padding: 10,
    gap: 6,
  },
  skeletonLine: {
    height: 12,
  },
  suggestionsSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  suggestionsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  loadingMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  loadingMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  suggestionCard: {
    width: (width - 56) / 3,
    aspectRatio: 2 / 3,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    position: 'relative',
    backgroundColor: theme.surface,
  },
  suggestionCardPressed: {
    borderColor: theme.primaryLight,
    opacity: 0.85,
  },
  suggestionPoster: {
    flex: 1,
    width: '100%',
  },
  suggestionPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surfaceLight,
  },
  suggestionContent: {
    padding: 8,
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textPrimary,
    lineHeight: 16,
    textAlign: 'center',
  },
});
