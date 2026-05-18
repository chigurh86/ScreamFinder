import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/template';
import { getSupabaseClient } from '@/template';
import type { Movie } from '../services/recommendationService';
import {
  initializeIAP,
  endIAPConnection,
  isIOSPlatform,
  getProducts,
} from '../services/iapService';
import type { IAPProduct } from '../services/iapService';

const FREE_DAILY_LIMIT = 3;
const FREE_FAVORITES_LIMIT = 10;

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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const SAVED_MOVIES_KEY = '@screamfinder_saved';
const SEARCH_HISTORY_KEY = '@screamfinder_history';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [savedMovies, setSavedMovies] = useState<Movie[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [subscriptionSource, setSubscriptionSource] = useState<'apple' | 'stripe' | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [iapInitialized, setIapInitialized] = useState(false);
  const [iapPricing, setIapPricing] = useState<IAPPricing | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const remaining = isSubscribed ? Infinity : Math.max(0, FREE_DAILY_LIMIT - searchCount);
  const isAtLimit = !isSubscribed && searchCount >= FREE_DAILY_LIMIT;
  const canSaveMore = isSubscribed || savedMovies.length < FREE_FAVORITES_LIMIT;
  const favoritesRemaining = isSubscribed ? Infinity : Math.max(0, FREE_FAVORITES_LIMIT - savedMovies.length);

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
      const [savedData, historyData] = await Promise.all([
        AsyncStorage.getItem(SAVED_MOVIES_KEY),
        AsyncStorage.getItem(SEARCH_HISTORY_KEY),
      ]);
      if (savedData) setSavedMovies(JSON.parse(savedData));
      if (historyData) setSearchHistory(JSON.parse(historyData));
    })();
  }, []);

  // Fetch avatar and daily usage from DB when user is available
  useEffect(() => {
    if (!user) {
      setSearchCount(0);
      setUsageLoaded(true);
      setAvatarUrl(null);
      return;
    }

    // Fetch avatar URL
    const fetchAvatar = async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('user_profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.avatar_url) setAvatarUrl(data.avatar_url);
    };
    fetchAvatar();

    const fetchUsage = async () => {
      const supabase = getSupabaseClient();
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('search_usage')
        .select('search_count')
        .eq('user_id', user.id)
        .eq('search_date', today)
        .maybeSingle();
      setSearchCount(data?.search_count ?? 0);
      setUsageLoaded(true);
    };
    fetchUsage();
  }, [user]);

  // Check subscription status
  const checkSubscription = useCallback(async () => {
    if (!user) return;
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
  }, [user]);

  // Check subscription on user change + periodic refresh
  useEffect(() => {
    if (user) {
      checkSubscription();
    } else {
      setIsSubscribed(false);
      setSubscriptionEnd(null);
      setSubscriptionSource(null);
    }
  }, [user, checkSubscription]);

  // Periodic subscription refresh (every 60 seconds)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      checkSubscription();
    }, 60000);
    return () => clearInterval(interval);
  }, [user, checkSubscription]);

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

  const addSearchHistory = useCallback((query: string) => {
    setSearchHistory((prev) => {
      const filtered = prev.filter((q) => q !== query);
      return [query, ...filtered].slice(0, 10);
    });
  }, []);

  const decrementSearches = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('search_usage')
      .select('id, search_count')
      .eq('user_id', user.id)
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
        user_id: user.id,
        search_date: today,
        search_count: 1,
      });
      setSearchCount(1);
    }
  }, [user]);

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
