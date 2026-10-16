import { corsHeaders } from '../_shared/cors.ts';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

interface TMDBSearchItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  poster_path?: string | null;
  media_type?: string;
}

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
 * Normalises a title for strict comparison — lower-case, strip
 * punctuation, collapse whitespace, drop leading articles. Used to decide
 * whether a TMDB search hit is actually the same title as the query
 * ("The Thing" vs "The Thing" — two different films from different
 * decades vs "The Thing from Another World" — different title entirely).
 */
function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title } = await req.json();

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'title is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('TMDB_API_KEY');
    if (!apiKey) {
      throw new Error('TMDB_API_KEY is not configured');
    }

    const query = title.trim();
    const normQuery = normalizeTitle(query);

    // Query both /search/movie and /search/tv in parallel so TV
    // franchises (American Horror Story, Scream the TV Series) also
    // appear in the picker next to their film counterparts.
    const [movieResp, tvResp] = await Promise.all([
      fetch(
        `${TMDB_BASE}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`
      ),
      fetch(
        `${TMDB_BASE}/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`
      ),
    ]);

    const movieData = movieResp.ok ? await movieResp.json() : { results: [] };
    const tvData = tvResp.ok ? await tvResp.json() : { results: [] };

    const movieResults = ((movieData.results || []) as TMDBSearchItem[]).map(
      (r) => ({ ...r, media_type: 'movie' })
    );
    const tvResults = ((tvData.results || []) as TMDBSearchItem[]).map((r) => ({
      ...r,
      media_type: 'tv',
    }));

    const combined: TMDBSearchItem[] = [...movieResults, ...tvResults];

    // Keep only hits that EXACTLY match the normalised query. This is
    // what prevents noise like "Scream Queens" from polluting a search
    // for "Scream". If the user wants a related-but-differently-named
    // title, they can type it directly.
    const exactMatches = combined.filter((r) => {
      const name = (r.title || r.name || '').trim();
      if (!name) return false;
      return normalizeTitle(name) === normQuery;
    });

    // Require minimal legitimacy — strip community-uploaded shells with
    // no votes and no popularity so the picker only shows releases a
    // user might plausibly remember.
    const legitimate = exactMatches.filter((r) => {
      const voteCount = r.vote_count || 0;
      const popularity = r.popularity || 0;
      return voteCount >= 10 || popularity >= 1.5;
    });

    // Deduplicate on (type, id)
    const seen = new Set<string>();
    const unique: TMDBSearchItem[] = [];
    for (const r of legitimate) {
      const key = `${r.media_type}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }

    const versions: MovieVersion[] = unique.map((r) => {
      const releaseDate = r.release_date || r.first_air_date || '';
      const year = releaseDate
        ? parseInt(releaseDate.split('-')[0], 10) || null
        : null;
      return {
        id: `${r.media_type}_${r.id}`,
        title: (r.title || r.name || '').trim(),
        year,
        type: r.media_type === 'tv' ? 'tv' : 'movie',
        posterUrl: r.poster_path
          ? `${TMDB_IMAGE_BASE}${r.poster_path}`
          : null,
        overview: (r.overview || '').trim(),
        popularity: r.popularity || 0,
        voteAverage: r.vote_average || 0,
        voteCount: r.vote_count || 0,
      };
    });

    // Sort: known year first (desc), then popularity.
    versions.sort((a, b) => {
      if (a.year && b.year && a.year !== b.year) return b.year - a.year;
      if (a.year && !b.year) return -1;
      if (!a.year && b.year) return 1;
      return b.popularity - a.popularity;
    });

    // Cap at a sensible number so the picker list stays scannable even
    // for titles with huge franchises (Halloween, Friday the 13th).
    const trimmed = versions.slice(0, 12);

    return new Response(
      JSON.stringify({ versions: trimmed, query }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    console.error('search-versions error:', e);
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
