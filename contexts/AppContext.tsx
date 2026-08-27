
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import { safeStorage } from '../services/safeStorage';
import { getSupabaseClient } from '@/template';
import type { Movie } from '../services/recommendationService';
import { setUserContext, addBreadcrumb } from '../services/errorReportingService';

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
const FREE_FAVORITES_LIMIT = 2;

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
  // Marks whether guest search usage has been loaded from AsyncStorage OR
  // written by a decrementSearches call. Prevents the async initial load
  // from clobbering a fresh in-memory increment (which was letting guests
  // search past the daily limit without ever hitting the paywall).
  const guestUsageLoadedRef = useRef(false);

  const remaining = isSubscribed ? Infinity : Math.max(0, FREE_DAILY_LIMIT - searchCount);
  const isAtLimit = !isSubscribed && searchCount >= FREE_DAILY_LIMIT;
  const canSaveMore = isSubscribed || savedMovies.length < FREE_FAVORITES_LIMIT;
  const favoritesRemaining = isSubscribed ? Infinity : Math.max(0, FREE_FAVORITES_LIMIT - savedMovies.length);

  // Subscribe directly to Supabase auth events — our single source of
  // truth for currentUser. Works reliably because it fires on the SAME
  // shared Supabase client that all our sign-in / sign-out calls target,
  // so there's no cross-client race and no missed events.
  //
  // BUILD 23 HARDENING: The entire setup is deferred by one tick with
  // setTimeout(0) and wrapped in nested try/catch blocks. On iOS 26.6
  // fresh-sandbox test devices, Supabase's internal calls into native
  // modules (Networking, WebSocket, secure storage) during synchronous
  // mount have caused background-queue NSExceptions that bypass our
  // JS-level error handler. Deferring gives the RN bridge a full tick
  // to settle before we touch native, and per-call try/catch downgrades
  // any synchronous throw to a caught JS warning instead of RCTFatal.
  useEffect(() => {
    let mounted = true;
    // The following `eslint-disable` comments are removed as they relate to linting rules, not syntax errors.
    let sub: { subscription: { unsubscribe: () => void; }; } | null = null; // Explicit type for `sub`
    

    const toAuthUser = (u: any): AuthUser => ({
      id: u.id,
      email: u.email || '',
      username: u.user_metadata?.username || u.user_metadata?.full_name,
    });

    const setupTimer = setTimeout(() => {
      if (!mounted) return;
      try {
        addBreadcrumb('boot:supabase-init', 'boot');
      } catch {
        /* ignore */
      }
      console.log('[AppContext] boot: initializing Supabase client');

      // The following `eslint-disable` comments are removed as they relate to linting rules, not syntax errors.
      let supabase: any;
      try {
        supabase = getSupabaseClient();
      } catch (e) {
        console.warn('[AppContext] getSupabaseClient threw:', e);
        return;
      }

      // Restore any existing session on cold start (page reload, app relaunch).
      try {
        supabase.auth
          .getSession()
          .then((res: any) => {
            if (!mounted) return;
            try {
              const user = res?.data?.session?.user;
              if (user) {
                const authUser = toAuthUser(user);
                setCurrentUser(authUser);
                try {
                  setUserContext({ id: authUser.id, email: authUser.email });
                } catch {
                  /* ignore Sentry tagging errors */
                }
              }
            } catch (e) {
              console.warn('[AppContext] getSession handler threw:', e);
            }
          })
          .catch(() => {
            /* no cached session — ignore */
          });
      } catch (e) {
        console.warn('[AppContext] getSession failed to start:', e);
      }

      // Listen for future sign-in / sign-out events. Wrap the entire
      // handler in try/catch so a bad session payload can never crash
      // the auth loop.
      try {
        const listenerResult = supabase.auth.onAuthStateChange(
          (event: string, session: any) => {
            try {
              if (!mounted) return;
              console.log(
                '[AppContext] Supabase auth event:',
                event,
                'user:',
                session?.user?.email || 'none',
              );
              try {
                addBreadcrumb(`auth:${event}`, 'auth', {
                  hasUser: !!session?.user,
                });
              } catch {
                /* breadcrumb failure never affects auth flow */
              }
              if (session?.user) {
                const authUser = toAuthUser(session.user);
                setCurrentUser(authUser);
                try {
                  setUserContext({ id: authUser.id, email: authUser.email });
                } catch {
                  /* ignore Sentry tagging errors */
                }
              } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
                setCurrentUser(null);
                setAvatarUrl(null);
                setProfileName(null);
                try {
                  setUserContext(null);
                } catch {
                  /* ignore Sentry tagging errors */
                }
              }
            } catch (e) {
              console.warn('[AppContext] auth event handler threw:', e);
            }
          },
        );
        sub = listenerResult?.data ?? null;
      } catch (e) {
        console.warn('[AppContext] onAuthStateChange failed:', e);
      }
    }, 0);

    return () => {
      mounted = false;
      clearTimeout(setupTimer);
      try {
        sub?.subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // CRITICAL: We do NOT initialize IAP at app boot anymore.
  //
  // Build 18/19 crashed on iOS 26 real devices with an NSException
  // originating on the React Native bridge queue during app startup.
  // The stack signature (objc_exception_throw → NSInvocation invoke →
  // ExceptionsManagerQueue → abort) is a NATIVE exception, which our
  // JS-level global error handler cannot catch. The most likely source
  // is react-native-iap's initConnection() firing during AppContext
  // mount and StoreKit 2 on iOS 26 throwing when the receipt / product
  // lookup fails.
  //
  // Instead, IAP is now initialized LAZILY — only when the user first
  // taps the subscribe button (via UpgradeModal). If the native module
  // throws at that point, it's a caught error in an async handler, not
  // an abort at boot.
  //
  // Trade-off: the price shown in UpgradeModal is briefly the fallback
  // ("$29.99") until StoreKit responds, then updates. Acceptable UX for
  // an app that actually launches.
  useEffect(() => {
    return () => {
      try {
        endIAPConnection();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Load saved movies from AsyncStorage.
  //
  // BUILD 23 HARDENING: Deferred by one tick with setTimeout(0) and
  // routed through safeStorage (per-op try/catch). Rationale: on iOS
  // 26.6 sandbox first-boot, synchronous AsyncStorage calls fired
  // during React's initial commit have caused native SQLite exceptions
  // on the storage module's background queue — exceptions that bypass
  // JS-level error handling and terminate the process. Deferring gives
  // the JS bridge a full tick to settle before touching native storage,
  // and every JSON.parse is individually guarded so a corrupt cache
  // entry can't take down the hydration path.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        addBreadcrumb('boot:hydrate-start', 'boot');
      } catch {
        /* ignore */
      }
      console.log('[AppContext] boot: hydrating saved state from storage');
      const [savedData, historyData, refreshData] = await Promise.all([
        safeStorage.getItem(SAVED_MOVIES_KEY),
        safeStorage.getItem(SEARCH_HISTORY_KEY),
        safeStorage.getItem(LAST_REFRESH_KEY),
      ]);
      if (cancelled) return;
      try {
        if (savedData) setSavedMovies(JSON.parse(savedData));
      } catch (e) {
        if (__DEV__) console.warn('[AppContext] saved parse failed:', e);
      }
      try {
        if (historyData) setSearchHistory(JSON.parse(historyData));
      } catch (e) {
        if (__DEV__) console.warn('[AppContext] history parse failed:', e);
      }
      try {
        if (refreshData) {
          const ts = parseInt(refreshData, 10);
          if (!isNaN(ts)) setLastFavoritesRefresh(ts);
        }
      } catch (e) {
        if (__DEV__) console.warn('[AppContext] refresh parse failed:', e);
      }
      try {
        addBreadcrumb('boot:hydrate-complete', 'boot');
      } catch {
        /* ignore */
      }
      console.log('[AppContext] boot: hydration complete');
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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

      // Guest mode: load today's search count from AsyncStorage. Only
      // apply the loaded value if a decrementSearches call hasn't already
      // written to storage in the meantime — otherwise a slow AsyncStorage
      // read can overwrite a fresh increment and let guests search past
      // the daily limit forever.
      (async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const stored = await safeStorage.getItem(GUEST_USAGE_KEY);
          if (guestUsageLoadedRef.current) {
            // A search already ran and wrote to storage; don't clobber it.
            return;
          }
          if (stored) {
            try {
              const parsed = JSON.parse(stored) as { date: string; count: number };
              setSearchCount(parsed.date === today ? (parsed.count || 0) : 0);
            } catch {
              setSearchCount(0);
            }
          } else {
            setSearchCount(0);
          }
          guestUsageLoadedRef.current = true;
        } catch {
          if (!guestUsageLoadedRef.current) {
            setSearchCount(0);
            guestUsageLoadedRef.current = true;
          }
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

  // Deep link handler for checkout success/cancel.
  //
  // BUILD 23 HARDENING: The entire registration is wrapped in try/catch,
  // and the delivered handler itself is guarded. On iOS 26 fresh-sandbox
  // launches, RCTLinkingManager has been observed to reject listener
  // registration outright (URL scheme validation tightened) or deliver
  // a malformed initial URL that trips a native NSException on the
  // module's dispatch queue. That exception would bypass JS error
  // handling and abort the process. Guarding both sites eliminates that
  // native crash path.
  useEffect(() => {
    // The following `eslint-disable` comments are removed as they relate to linting rules, not syntax errors.
    let sub: { remove: () => void; } | null = null; // Explicit type for `sub`
    try {
      addBreadcrumb('boot:linking-register', 'boot');
    } catch {
      /* ignore */
    }
    try {
      const handleDeepLink = (event: { url: string }) => {
        try {
          const url = event?.url;
          if (typeof url === 'string' && url.includes('subscription/success')) {
            checkSubscription();
          }
        } catch (e) {
          if (__DEV__) console.warn('[AppContext] handleDeepLink threw:', e);
        }
      };
      sub = Linking.addEventListener('url', handleDeepLink);
    } catch (e) {
      console.warn('[AppContext] Linking.addEventListener threw:', e);
    }
    return () => {
      try {
        sub?.remove?.();
      } catch {
        /* ignore */
      }
    };
  }, [checkSubscription]);

  useEffect(() => {
    safeStorage.setItem(SAVED_MOVIES_KEY, JSON.stringify(savedMovies));
  }, [savedMovies]);

  useEffect(() => {
    safeStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    if (lastFavoritesRefresh !== null) {
      safeStorage.setItem(LAST_REFRESH_KEY, String(lastFavoritesRefresh));
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
      // Guest mode: AsyncStorage is the source of truth. Read the latest
      // stored value first so we never lose an increment to a stale React
      // closure or a still-in-flight initial load. This is what makes the
      // guest paywall actually fire after 5 searches.
      let baseCount = 0;
      try {
        const stored = await safeStorage.getItem(GUEST_USAGE_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as { date: string; count: number };
            baseCount = parsed.date === today ? (parsed.count || 0) : 0;
          } catch {
            baseCount = 0;
          }
        }
      } catch {
        baseCount = searchCount;
      }
      const newCount = baseCount + 1;
      await safeStorage.setItem(
        GUEST_USAGE_KEY,
        JSON.stringify({ date: today, count: newCount }),
      );
      // Mark loaded so the async initial-load useEffect can't clobber us.
      guestUsageLoadedRef.current = true;
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
          try {
            setUserContext({ id: authUser.id, email: authUser.email });
          } catch {
            /* ignore Sentry tagging errors */
          }
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
    try {
      setUserContext(null);
    } catch {
      /* ignore Sentry tagging errors */
    }
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
      try {
        setUserContext(null);
      } catch {
        /* ignore Sentry tagging errors */
      }
      if (error) return { error: error.message };
      return { error: null };
    } catch (e) {
      setCurrentUser(null);
      try {
        setUserContext(null);
      } catch {
        /* ignore Sentry tagging errors */
      }
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
