import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

const CACHE_KEY = '@screamfinder_poster_cache';
const PROVIDER_CACHE_KEY = '@screamfinder_provider_cache';
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry<T> {
  [key: string]: { value: T; timestamp: number };
}

let posterCache: CacheEntry<string> = {};
let providerCache: CacheEntry<string[]> = {};
let posterCacheLoaded = false;
let providerCacheLoaded = false;

async function loadPosterCache(): Promise<void> {
  if (posterCacheLoaded) return;
  try {
    const data = await AsyncStorage.getItem(CACHE_KEY);
    if (data) {
      posterCache = JSON.parse(data);
      const now = Date.now();
      for (const key of Object.keys(posterCache)) {
        if (now - posterCache[key].timestamp > CACHE_EXPIRY_MS) {
          delete posterCache[key];
        }
      }
    }
    posterCacheLoaded = true;
  } catch {
    posterCacheLoaded = true;
  }
}

async function loadProviderCache(): Promise<void> {
  if (providerCacheLoaded) return;
  try {
    const data = await AsyncStorage.getItem(PROVIDER_CACHE_KEY);
    if (data) {
      providerCache = JSON.parse(data);
      const now = Date.now();
      for (const key of Object.keys(providerCache)) {
        if (now - providerCache[key].timestamp > CACHE_EXPIRY_MS) {
          delete providerCache[key];
        }
      }
    }
    providerCacheLoaded = true;
  } catch {
    providerCacheLoaded = true;
  }
}

async function savePosterCache(): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(posterCache));
  } catch {
    // Silently fail
  }
}

async function saveProviderCache(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROVIDER_CACHE_KEY, JSON.stringify(providerCache));
  } catch {
    // Silently fail
  }
}

function getCacheKey(title: string, year: number, type: string): string {
  return `${title.toLowerCase()}_${year}_${type}`;
}

export interface PosterResult {
  posters: Record<string, string>;
  providers: Record<string, string[]>;
}

/**
 * Fetches poster URLs and verified streaming providers for an array of movies
 * via the poster edge function. Uses local cache to avoid redundant requests.
 */
export async function fetchPostersAndProviders(
  movies: Array<{ title: string; year: number; type: 'movie' | 'tv' }>
): Promise<PosterResult> {
  await Promise.all([loadPosterCache(), loadProviderCache()]);

  const posters: Record<string, string> = {};
  const providers: Record<string, string[]> = {};
  const toFetch: Array<{ title: string; year: number; type: string }> = [];

  // Check cache first
  for (const movie of movies) {
    const key = getCacheKey(movie.title, movie.year, movie.type);
    const hasPoster = posterCache[key];
    const hasProvider = providerCache[key];

    if (hasPoster) {
      posters[movie.title] = hasPoster.value;
    }
    if (hasProvider) {
      providers[movie.title] = hasProvider.value;
    }

    // If either is missing, fetch from server
    if (!hasPoster || !hasProvider) {
      toFetch.push(movie);
    }
  }

  if (toFetch.length === 0) return { posters, providers };

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('poster', {
      body: { movies: toFetch },
    });

    if (error) {
      let errorMessage = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const textContent = await error.context?.text();
          errorMessage = textContent || error.message;
        } catch {
          // ignore
        }
      }
      console.warn('Poster fetch error:', errorMessage);
      return { posters, providers };
    }

    if (data && typeof data === 'object') {
      const resultMap = data as Record<string, { posterUrl: string | null; providers: string[] } | string | null>;

      for (const movie of toFetch) {
        const entry = resultMap[movie.title];
        const key = getCacheKey(movie.title, movie.year, movie.type);
        const now = Date.now();

        if (entry && typeof entry === 'object' && 'posterUrl' in entry) {
          // New format: { posterUrl, providers }
          if (entry.posterUrl) {
            posters[movie.title] = entry.posterUrl;
            posterCache[key] = { value: entry.posterUrl, timestamp: now };
          }
          if (entry.providers && entry.providers.length > 0) {
            providers[movie.title] = entry.providers;
            providerCache[key] = { value: entry.providers, timestamp: now };
          }
        } else if (typeof entry === 'string') {
          // Legacy format fallback: just a URL string
          posters[movie.title] = entry;
          posterCache[key] = { value: entry, timestamp: now };
        }
      }

      savePosterCache(); // Fire and forget
      saveProviderCache();
    }
  } catch (err) {
    console.warn('Poster service error:', err);
  }

  return { posters, providers };
}

/**
 * Backwards-compatible wrapper that returns only poster URLs.
 */
export async function fetchPosters(
  movies: Array<{ title: string; year: number; type: 'movie' | 'tv' }>
): Promise<Record<string, string>> {
  const result = await fetchPostersAndProviders(movies);
  return result.posters;
}
