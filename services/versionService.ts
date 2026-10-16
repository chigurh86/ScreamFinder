import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface MovieVersion {
  id: string;
  title: string;
  year: number | null;
  type: 'movie' | 'tv';
  posterUrl: string | null;
  overview: string;
  popularity: number;
  voteAverage: number;
  voteCount: number;
}

/**
 * Looks up every TMDB entry whose title exactly matches `title` so the
 * user can disambiguate between remakes/reboots (The Thing 1982 vs
 * 2011, Halloween 1978 vs 2007 vs 2018, Scream 1996 vs 2022, etc.).
 *
 * Returns an empty array on any failure so the caller can fall back to
 * the previous "best match" flow — the version picker is a UX
 * enhancement, not a hard dependency of search.
 */
export async function fetchMovieVersions(
  title: string
): Promise<{ versions: MovieVersion[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('search-versions', {
      body: { title },
    });

    if (error) {
      let errorMessage = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const text = await error.context?.text();
          errorMessage = text || errorMessage;
        } catch {
          /* ignore */
        }
      }
      console.warn('[versionService] fetch error:', errorMessage);
      return { versions: [], error: errorMessage };
    }

    const versions = (data?.versions ?? []) as MovieVersion[];
    return { versions, error: null };
  } catch (e) {
    console.warn('[versionService] threw:', e);
    return {
      versions: [],
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
