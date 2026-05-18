import { corsHeaders } from '../_shared/cors.ts';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

interface MovieResult {
  posterUrl: string | null;
  providers: string[];
}

interface TMDBSearchResult {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
}

/**
 * Normalizes a title for comparison: lowercase, strip punctuation, "the", articles.
 */
function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Picks the best TMDB search result by matching year and title similarity.
 */
function pickBestMatch(
  results: TMDBSearchResult[],
  queryTitle: string,
  queryYear: number,
  mediaType: string
): TMDBSearchResult | null {
  if (!results || results.length === 0) return null;

  const normQuery = normalizeTitle(queryTitle);

  // Score each result
  const scored = results
    .filter((r) => r.poster_path) // must have a poster
    .map((r) => {
      const name = (mediaType === 'tv' ? r.name : r.title) || r.name || r.title || '';
      const date = r.release_date || r.first_air_date || '';
      const resultYear = date ? parseInt(date.split('-')[0], 10) : 0;
      const normName = normalizeTitle(name);

      let score = 0;

      // Title match scoring
      if (normName === normQuery) {
        score += 100; // exact match
      } else if (normName.includes(normQuery) || normQuery.includes(normName)) {
        score += 60; // partial match
      } else {
        score += 10; // weak match
      }

      // Year match scoring
      if (queryYear && resultYear) {
        const yearDiff = Math.abs(resultYear - queryYear);
        if (yearDiff === 0) score += 50;
        else if (yearDiff === 1) score += 40;
        else if (yearDiff <= 3) score += 20;
        else score -= yearDiff * 2;
      }

      // Popularity tiebreaker (prefer more popular for same score)
      score += Math.min((r.popularity || 0) / 100, 5);

      return { result: r, score };
    });

  if (scored.length === 0) {
    // Fall back to first result with poster
    return results.find((r) => r.poster_path) || results[0] || null;
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0].result;
}

/**
 * Fetches watch providers for a TMDB item.
 * Returns provider names for the US region (flatrate + ads + free tiers).
 */
async function fetchWatchProviders(
  tmdbId: number,
  mediaType: string,
  apiKey: string
): Promise<string[]> {
  try {
    const url = `${TMDB_BASE}/${mediaType}/${tmdbId}/watch/providers?api_key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();

    // Get US providers; fall back to GB then any first available region
    const regionData = data.results?.US || data.results?.GB || Object.values(data.results || {})[0] as any;
    if (!regionData) return [];

    // Combine flatrate (subscription), ads, and free tiers
    const providerMap = new Map<number, string>();
    const tiers = [regionData.flatrate, regionData.ads, regionData.free];
    for (const tier of tiers) {
      if (Array.isArray(tier)) {
        for (const p of tier) {
          if (p.provider_name && !providerMap.has(p.provider_id)) {
            providerMap.set(p.provider_id, p.provider_name);
          }
        }
      }
    }

    return Array.from(providerMap.values()).slice(0, 5);
  } catch (err) {
    console.error(`Watch provider fetch failed for tmdbId ${tmdbId}:`, err);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { movies } = await req.json();

    if (!Array.isArray(movies) || movies.length === 0) {
      return new Response(
        JSON.stringify({ error: 'movies array is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
    if (!TMDB_API_KEY) {
      throw new Error('TMDB_API_KEY is not configured');
    }

    const results: Record<string, MovieResult> = {};

    // Process in parallel with concurrency limit of 6
    const batchSize = 6;
    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize);
      const promises = batch.map(
        async (movie: { title: string; year: number; type: string }) => {
          try {
            const mediaType = movie.type === 'tv' ? 'tv' : 'movie';
            const yearParam = movie.year ? `&year=${movie.year}` : '';
            const firstAirParam = movie.year && mediaType === 'tv' ? `&first_air_date_year=${movie.year}` : '';

            // Search with year filter first
            const searchUrl = `${TMDB_BASE}/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}${mediaType === 'tv' ? firstAirParam : yearParam}&include_adult=false`;
            const searchResp = await fetch(searchUrl);
            let allResults: TMDBSearchResult[] = [];
            if (searchResp.ok) {
              const searchData = await searchResp.json();
              allResults = searchData.results || [];
            }

            // If year-filtered search has few results, also search without year
            if (allResults.length < 3 && movie.year) {
              const broadUrl = `${TMDB_BASE}/search/${mediaType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&include_adult=false`;
              const broadResp = await fetch(broadUrl);
              if (broadResp.ok) {
                const broadData = await broadResp.json();
                const existing = new Set(allResults.map((r) => r.id));
                for (const r of (broadData.results || [])) {
                  if (!existing.has(r.id)) allResults.push(r);
                }
              }
            }

            let matchResult = pickBestMatch(allResults, movie.title, movie.year || 0, mediaType);
            let usedMediaType = mediaType;

            // Fallback: try the other media type if no good result
            if (!matchResult?.poster_path) {
              const altType = mediaType === 'movie' ? 'tv' : 'movie';
              const altUrl = `${TMDB_BASE}/search/${altType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(movie.title)}&include_adult=false`;
              const altResp = await fetch(altUrl);
              if (altResp.ok) {
                const altData = await altResp.json();
                const altMatch = pickBestMatch(altData.results || [], movie.title, movie.year || 0, altType);
                if (altMatch?.poster_path) {
                  matchResult = altMatch;
                  usedMediaType = altType;
                }
              }
            }

            if (matchResult) {
              const posterUrl = matchResult.poster_path
                ? `${TMDB_IMAGE_BASE}${matchResult.poster_path}`
                : null;

              // Fetch watch providers in parallel
              const providers = await fetchWatchProviders(
                matchResult.id,
                usedMediaType,
                TMDB_API_KEY
              );

              results[movie.title] = { posterUrl, providers };
            } else {
              results[movie.title] = { posterUrl: null, providers: [] };
            }
          } catch (err) {
            console.error(`Poster fetch failed for "${movie.title}":`, err);
            results[movie.title] = { posterUrl: null, providers: [] };
          }
        }
      );
      await Promise.all(promises);
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('poster error:', e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
