import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { fetchPostersAndProviders } from './posterService';

export interface Movie {
  id: string;
  title: string;
  year: number;
  description: string;
  type: 'movie' | 'tv';
  streamingOn: string[];
  posterUrl: string | null;
  matchPercent?: number;
  rating?: number;
  tags?: string[];
  verifiedStreaming?: boolean;
}

export async function fetchRecommendations(
  title: string,
  excludeTitles: string[] = [],
  year?: number | null,
  director?: string | null
): Promise<{ data: Movie[] | null; error: string | null; inputYear?: number | null }> {
  const supabase = getSupabaseClient();

  const body: Record<string, unknown> = { title, exclude: excludeTitles };
  if (year) body.year = year;
  if (director) body.director = director;

  const { data, error } = await supabase.functions.invoke('recommend', {
    body,
  });

  if (error) {
    let errorMessage = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const statusCode = error.context?.status ?? 500;
        const textContent = await error.context?.text();
        errorMessage = `[Code: ${statusCode}] ${textContent || error.message || 'Unknown error'}`;
      } catch {
        errorMessage = `${error.message || 'Failed to read response'}`;
      }
    }
    return { data: null, error: errorMessage };
  }

  // Handle both new format { recommendations, inputYear } and legacy array format
  if (data && typeof data === 'object' && 'recommendations' in data) {
    const movies = data.recommendations as Movie[];
    const inputYear = data.inputYear as number | null;
    return { data: movies, error: null, inputYear };
  }

  const movies = data as Movie[];
  return { data: movies, error: null };
}

/**
 * Fetches poster URLs and verified streaming providers for an array of movies.
 * Replaces AI-guessed streaming platforms with TMDB-verified ones when available.
 */
export async function enrichWithPosters(movies: Movie[]): Promise<Movie[]> {
  const moviesToFetch = movies.filter((m) => !m.posterUrl || !m.verifiedStreaming);
  if (moviesToFetch.length === 0) return movies;

  const { posters, providers } = await fetchPostersAndProviders(
    moviesToFetch.map((m) => ({ title: m.title, year: m.year, type: m.type }))
  );

  return movies.map((movie) => {
    const posterUrl = movie.posterUrl || posters[movie.title] || null;
    const verifiedProviders = providers[movie.title];

    return {
      ...movie,
      posterUrl: posterUrl || movie.posterUrl,
      // Replace AI-guessed streaming with verified TMDB data when available
      streamingOn: verifiedProviders && verifiedProviders.length > 0
        ? verifiedProviders
        : movie.streamingOn,
      verifiedStreaming: verifiedProviders && verifiedProviders.length > 0 ? true : false,
    };
  });
}
