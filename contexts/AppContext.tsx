import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/template';
import type { Movie } from '../services/recommendationService';

/**
 * Minimal user shape (mirrors the template's AuthUser). We manage this
 * locally — subscribing directly to Supabase's onAuthStateChange on the
 * shared client — because the template's AuthProvider frequently misses
 * SIGNED_IN events fired by direct supabase.auth.* calls, which leaves
 * the app stuck showing "Guest" even with a perfectly valid session.
 * Managing our own state on the same shared client eliminates the race.
 */
export interface AuthUser {
  id: string;
  email: string;
  username?: string;
}
import {
  initializeIAP,
  endIAPConnection,
  isIOSPlatform,
  getProducts,
} from '../services/iapService';
import type { IAPProduct } from '../services/iapService';

const FREE_DAILY_LIMIT = 5;
const FREE_FAVORITES_LIMIT = 5;

export interface IAPPricing {
  yearlyPrice: string;       // e.g. "$29.99" or "€27.99"
  monthlyEquivalent: string; // e.g. "$2.50" or "€2.33"
  currencySymbol: string;
  rawPrice: number;
}

interface AppContextType {
  savedMovies: Movie[];
  isSaved: (title: string) => boolean;
  toggleSave: (movie: Movie) => boolean;
  canSaveMore: boolean;
  favoritesRemaining: number;
  removeSaved: (title: string) => void;
  clearAllSaved: () => void;
  updateSavedMovies: (updates: Record<string, Partial<Movie>>) => void;
  lastFavoritesRefresh: number | null;
  setLastFavoritesRefresh: (timestamp: number) => void;
  searchHistory: string[];
  addSearchHistory: (query: string) => void;
  remainingSearches: number;
  isAtLimit: boolean;
  decrementSearches: () => Promise<void>;
  isSubscribed: boolean;
  setIsSubscribed: (val: boolean) => void;
  subscriptionEnd: string | null;
  setSubscriptionEnd: (val: string | null) => void;
  subscriptionSource: 'apple' | 'stripe' | null;
  checkSubscription: () => Promise<void>;
  iapInitialized: boolean;
  iapPricing: IAPPricing | null;
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  profileName: string | null;
  refreshProfile: () => Promise<void>;
  currentUser: AuthUser | null;
  signOut: () => Promise<{ error: string | null }>;
  refreshAuthState: () => Promise<AuthUser | null>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const SAVED_MOVIES_KEY = '@screamfinder_saved';
const SEARCH_HISTORY_KEY = '@screamfinder_history';
const LAST_REFRESH_KEY = '@screamfinder_last_refresh';
const GUEST_USAGE_KEY = '@screamfinder_guest_usage';

export function AppProvider({ children }: { children: React.ReactNode }) {
  // We manage auth state ourselves rather than relying on the template's
  // useAuth() — the template's AuthProvider misses SIGNED_IN events fired
  // by direct supabase.auth.* calls, leaving the app stuck on "Guest".
  // Our own subscription on the SAME shared Supabase client is rock-solid.
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [savedMovies, setSavedMovies] = useState<Movie[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [lastFavoritesRefresh, setLastFavoritesRefresh] = useState<number | null>(null);
  const [searchCount, setSearchCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [subscriptionSource, setSubscriptionSource] = useState<'apple' | 'stripe' | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [iapInitialized, setIapInitialized] = useState(false);
  const [iapPricing, setIapPricing] = useState<IAPPricing | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const profileFetchAbortRef = useRef<{ userId: string | null; cancelled: boolean }>({
    userId: null,
    cancelled: false,
  });

  const remaining = isSubscribed ? Infinity : Math.max(0, FREE_DAILY_LIMIT - searchCount);
  const isAtLimit = !isSubscribed && searchCount >= FREE_DAILY_LIMIT;
  const canSaveMore = isSubscribed || savedMovies.length < FREE_FAVORITES_LIMIT;
  const favoritesRemaining = isSubscribed ? Infinity : Math.max(0, FREE_FAVORITES_LIMIT - savedMovies.length);

  // Subscribe directly to Supabase auth events — our single source of
  // truth for currentUser. Works reliably because it fires on the SAME
  // shared Supabase client that all our sign-in / sign-out calls target,
  // so there's no cross-client race and no missed events.
  useEffect(() => {
    const supabase = getSupabaseClient();
    let mounted = true;

    const toAuthUser = (u: any): AuthUser => ({
      id: u.id,
      email: u.email || '',
      username: u.user_metadata?.username || u.user_metadata?.full_name,
    });

    // Restore any existing session on cold start (page reload, app relaunch).
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        if (data?.session?.user) {
          setCurrentUser(toAuthUser(data.session.user));
        }
      })
      .catch(() => {
        /* no cached session — ignore */
      });

    // Listen for future sign-in / sign-out events.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        console.log(
          '[AppContext] Supabase auth event:',
          event,
          'user:',
          session?.user?.email || 'none',
        );
        if (session?.user) {
          setCurrentUser(toAuthUser(session.user));
        } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          setCurrentUser(null);
          setAvatarUrl(null);
          setProfileName(null);
        }
      },
    );

    return () => {
      mounted = false;
      try {
        sub?.subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Initialize IAP on iOS and fetch product pricing
  useEffect(() => {
    if (isIOSPlatform()) {
      initializeIAP().then(async (success) => {
        setIapInitialized(success);
        console.log('[AppContext] IAP initialized:', success);
        if (success) {
          try {
            const products = await getProducts();
            if (products.length > 0) {
              const product = products[0];
              const rawPrice = parseFloat(product.price) || 29.99;
              const monthlyRaw = rawPrice / 12;
              // Extract currency symbol from localizedPrice (e.g. "$29.99" -> "$")
              const symbolMatch = product.localizedPrice.match(/^[^\d]+/);
              const currencySymbol = symbolMatch ? symbolMatch[0].trim() : '$';
              // Format monthly equivalent
              const monthlyFormatted = `${currencySymbol}${monthlyRaw.toFixed(2)}`;
              setIapPricing({
                yearlyPrice: product.localizedPrice,
                monthlyEquivalent: monthlyFormatted,
                currencySymbol,
                rawPrice,
              });
              console.log('[AppContext] IAP pricing loaded:', product.localizedPrice);
            }
          } catch (e) {
            console.error('[AppContext] Failed to fetch IAP products:', e);
          }
        }
      });

      return () => {
        endIAPConnection();
      };
    }
  }, []);

  // Load saved movies from AsyncStorage
  useEffect(() => {
    (async () => {
      const [savedData, historyData, refreshData] = await Promise.all([
        AsyncStorage.getItem(SAVED_MOVIES_KEY),
        AsyncStorage.getItem(SEARCH_HISTORY_KEY),
        AsyncStorage.getItem(LAST_REFRESH_KEY),
      ]);
      if (savedData) setSavedMovies(JSON.parse(savedData));
      if (historyData) setSearchHistory(JSON.parse(historyData));
      if (refreshData) {
        const ts = parseInt(refreshData, 10);
        if (!isNaN(ts)) setLastFavoritesRefresh(ts);
      }
    })();
  }, []);

  // Fetch avatar + username with retry logic. When the AuthProvider fires
  // its user-change event, Supabase's shared client may not yet have the
  // JWT fully attached to PostgREST requests, so the RLS-protected select
  // returns silently empty. We retry up to 4 times with backoff to cover
  // that propagation window, and log the actual error so it doesn't fail
  // invisibly.
  const fetchProfileWithRetry = useCallback(
    async (userId: string, maxAttempts = 4): Promise<void> => {
      profileFetchAbortRef.current = { userId, cancelled: false };
      const abortToken = profileFetchAbortRef.current;
      const supabase = getSupabaseClient();

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (abortToken.cancelled || abortToken.userId !== userId) return;
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('avatar_url, username')
            .eq('id', userId)
            .maybeSingle();

          if (abortToken.cancelled || abortToken.userId !== userId) return;

          if (error) {
            console.warn(
              `[AppContext] Profile fetch attempt ${attempt + 1}/${maxAttempts} failed:`,
              error.message,
            );
          } else if (data) {
            if (data.avatar_url) setAvatarUrl(data.avatar_url);
            if (data.username) setProfileName(data.username);
            // Success — stop retrying if we got any profile data at all.
            if (data.avatar_url || data.username) return;
          }
        } catch (e) {
          console.warn(
            `[AppContext] Profile fetch attempt ${attempt + 1}/${maxAttempts} threw:`,
            e instanceof Error ? e.message : String(e),
          );
        }

        // Wait before retrying — gives the auth session time to propagate.
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
    },
    [],
  );

  // Manual refresh hook — called from login flow immediately after a
  // successful sign-in so we don't have to wait for the user-effect to
  // fire (which is subject to React batching delays).
  const refreshProfile = useCallback(async () => {
    if (!currentUser?.id) return;
    await fetchProfileWithRetry(currentUser.id);
  }, [currentUser, fetchProfileWithRetry]);

  // Fetch avatar and daily usage from DB when currentUser is available,
  // or read local guest usage from AsyncStorage when signed out.
  useEffect(() => {
    if (!currentUser) {
      // Cancel any in-flight profile fetch for a previous user.
      profileFetchAbortRef.current.cancelled = true;
      setAvatarUrl(null);
      setProfileName(null);

      // Guest mode: load today's search count from AsyncStorage
      (async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const stored = await AsyncStorage.getItem(GUEST_USAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as { date: string; count: number };
            setSearchCount(parsed.date === today ? (parsed.count || 0) : 0);
          } else {
            setSearchCount(0);
          }
        } catch {
          setSearchCount(0);
        } finally {
          setUsageLoaded(true);
        }
      })();
      return;
    }

    // New user just signed in — clear any stale profile data from a
    // previous account before we fetch this one's data.
    if (profileFetchAbortRef.current.userId !== currentUser.id) {
      profileFetchAbortRef.current.cancelled = true;
      setAvatarUrl(null);
      setProfileName(null);
    }

    // Kick off retry-backed profile fetch.
    fetchProfileWithRetry(currentUser.id);

    const fetchUsage = async () => {
      const supabase = getSupabaseClient();
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('search_usage')
        .select('search_count')
        .eq('user_id', currentUser.id)
        .eq('search_date', today)
        .maybeSingle();
      setSearchCount(data?.search_count ?? 0);
      setUsageLoaded(true);
    };
    fetchUsage();
  }, [currentUser, fetchProfileWithRetry]);

  // Check subscription status
  const checkSubscription = useCallback(async () => {
    if (!currentUser) return;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (!error && data) {
        setIsSubscribed(data.subscribed === true);
        setSubscriptionEnd(data.subscription_end || null);
        setSubscriptionSource(data.source || null);
      }
    } catch {
      // silently fail
    }
  }, [currentUser]);

  // Check subscription on user change + periodic refresh
  useEffect(() => {
    if (currentUser) {
      checkSubscription();
    } else {
      setIsSubscribed(false);
      setSubscriptionEnd(null);
      setSubscriptionSource(null);
    }
  }, [currentUser, checkSubscription]);

  // Periodic subscription refresh (every 60 seconds)
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      checkSubscription();
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser, checkSubscription]);

  // Deep link handler for checkout success/cancel
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      if (event.url.includes('subscription/success')) {
        checkSubscription();
      }
    };
    const sub = Linking.addEventListener('url', handleDeepLink);
    return () => sub.remove();
  }, [checkSubscription]);

  useEffect(() => {
    AsyncStorage.setItem(SAVED_MOVIES_KEY, JSON.stringify(savedMovies));
  }, [savedMovies]);

  useEffect(() => {
    AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    if (lastFavoritesRefresh !== null) {
      AsyncStorage.setItem(LAST_REFRESH_KEY, String(lastFavoritesRefresh));
    }
  }, [lastFavoritesRefresh]);

  const isSaved = useCallback(
    (title: string) => savedMovies.some((m) => m.title === title),
    [savedMovies]
  );

  const toggleSave = useCallback((movie: Movie): boolean => {
    const exists = savedMovies.some((m) => m.title === movie.title);
    if (!exists && !isSubscribed && savedMovies.length >= FREE_FAVORITES_LIMIT) {
      return false; // limit reached
    }
    setSavedMovies((prev) => {
      const ex = prev.some((m) => m.title === movie.title);
      if (ex) return prev.filter((m) => m.title !== movie.title);
      return [movie, ...prev];
    });
    return true;
  }, [savedMovies, isSubscribed]);

  const removeSaved = useCallback((title: string) => {
    setSavedMovies((prev) => prev.filter((m) => m.title !== title));
  }, []);

  const clearAllSaved = useCallback(() => {
    setSavedMovies([]);
  }, []);

  const updateSavedMovies = useCallback(
    (updates: Record<string, Partial<Movie>>) => {
      setSavedMovies((prev) =>
        prev.map((m) => {
          const update = updates[m.title];
          if (!update) return m;
          return { ...m, ...update };
        })
      );
    },
    []
  );

  const addSearchHistory = useCallback((query: string) => {
    setSearchHistory((prev) => {
      const filtered = prev.filter((q) => q !== query);
      return [query, ...filtered].slice(0, 10);
    });
  }, []);

  const decrementSearches = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    if (!currentUser) {
      // Guest mode: persist daily count in AsyncStorage
      const newCount = searchCount + 1;
      try {
        await AsyncStorage.setItem(
          GUEST_USAGE_KEY,
          JSON.stringify({ date: today, count: newCount })
        );
      } catch {
        /* ignore storage errors */
      }
      setSearchCount(newCount);
      return;
    }

    const supabase = getSupabaseClient();

    const { data: existing } = await supabase
      .from('search_usage')
      .select('id, search_count')
      .eq('user_id', currentUser.id)
      .eq('search_date', today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('search_usage')
        .update({ search_count: existing.search_count + 1 })
        .eq('id', existing.id);
      setSearchCount(existing.search_count + 1);
    } else {
      await supabase.from('search_usage').insert({
        user_id: currentUser.id,
        search_date: today,
        search_count: 1,
      });
      setSearchCount(1);
    }
  }, [currentUser, searchCount]);

  // Re-reads the Supabase session and updates currentUser. Called from
  // the login flow after a successful sign-in as a belt-and-suspenders
  // check in case the onAuthStateChange event listener missed firing.
  // Retries briefly to cover the session-propagation window.
  const refreshAuthState = useCallback(async (): Promise<AuthUser | null> => {
    const supabase = getSupabaseClient();
    for (let i = 0; i < 5; i++) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          const u = data.session.user;
          const authUser: AuthUser = {
            id: u.id,
            email: u.email || '',
            username: u.user_metadata?.username || u.user_metadata?.full_name,
          };
          setCurrentUser(authUser);
          return authUser;
        }
      } catch {
        /* keep polling */
      }
      if (i < 4) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    setCurrentUser(null);
    return null;
  }, []);

  // Directly signs out via Supabase and immediately clears local state.
  // Bypasses the template's logout wrapper which sometimes throws even
  // when the sign-out succeeds server-side.
  const signOut = useCallback(async (): Promise<{ error: string | null }> => {
    const supabase = getSupabaseClient();
    try {
      const { error } = await supabase.auth.signOut();
      // Clear our state immediately for a snappy UI transition. The
      // auth event listener will fire SIGNED_OUT and reconfirm shortly.
      setCurrentUser(null);
      setAvatarUrl(null);
      setProfileName(null);
      setIsSubscribed(false);
      setSubscriptionEnd(null);
      setSubscriptionSource(null);
      if (error) return { error: error.message };
      return { error: null };
    } catch (e) {
      setCurrentUser(null);
      return {
        error: e instanceof Error ? e.message : 'Sign out failed',
      };
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        savedMovies,
        isSaved,
        toggleSave,
        canSaveMore,
        favoritesRemaining,
        removeSaved,
        clearAllSaved,
        updateSavedMovies,
        lastFavoritesRefresh,
        setLastFavoritesRefresh,
        searchHistory,
        addSearchHistory,
        remainingSearches: remaining,
        isAtLimit,
        decrementSearches,
        isSubscribed,
        setIsSubscribed,
        subscriptionEnd,
        setSubscriptionEnd,
        subscriptionSource,
        checkSubscription,
        iapInitialized,
        iapPricing,
        avatarUrl,
        setAvatarUrl,
        profileName,
        refreshProfile,
        currentUser,
        signOut,
        refreshAuthState,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
