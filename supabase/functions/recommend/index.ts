import { corsHeaders } from '../_shared/cors.ts';

const TMDB_BASE = 'https://api.themoviedb.org/3';

interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  popularity?: number;
  vote_average?: number;
  genre_ids?: number[];
  media_type?: string;
}

/**
 * Fetches obscure/lesser-known horror titles from TMDB related to the input.
 * Uses similar, recommendations, and discover endpoints.
 */
interface TMDBContext {
  suggestions: string[];
  inputYear: number | null;
  inputDecade: string | null;
}

async function fetchTMDBSuggestions(
  title: string,
  apiKey: string
): Promise<TMDBContext> {
  const suggestions: Map<string, { name: string; year: string; popularity: number }> = new Map();
  let inputYear: number | null = null;
  let inputDecade: string | null = null;

  try {
    // Step 1: Search TMDB for the input title to get its ID.
    // search/multi returns movies, TV shows, and people; we filter out people
    // and pick the highest-popularity match with a strong exact-title bonus.
    // This prevents obscure same-name titles from beating famous ones like
    // Jaws (1975) or The Shining (1980).
    const searchUrl = `${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(title)}&include_adult=false`;
    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) return { suggestions: [], inputYear: null, inputDecade: null };
    const searchData = await searchResp.json();

    const normalizedQuery = title.toLowerCase().trim();
    const mediaMatches = ((searchData.results || []) as Array<TMDBMovie & { media_type?: string; poster_path?: string | null }>).filter(
      (r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path
    );

    if (mediaMatches.length === 0) {
      return { suggestions: [], inputYear: null, inputDecade: null };
    }

    const scoredMatches = mediaMatches.map((r) => {
      const name = ((r.title || r.name || '') as string).toLowerCase().trim();
      let score = r.popularity || 0;
      if (name === normalizedQuery) score += 1000; // exact title match
      else if (name.includes(normalizedQuery) || normalizedQuery.includes(name)) score += 200;
      return { result: r, score };
    });
    scoredMatches.sort((a, b) => b.score - a.score);
    const match = scoredMatches[0].result;
    if (!match) return { suggestions: [], inputYear: null, inputDecade: null };

    // Extract the release year of the searched title
    const releaseDate = match.release_date || match.first_air_date || '';
    if (releaseDate) {
      inputYear = parseInt(releaseDate.split('-')[0], 10) || null;
      if (inputYear) {
        const decadeStart = Math.floor(inputYear / 10) * 10;
        inputDecade = `${decadeStart}s`;
      }
    }

    const mediaType = match.media_type === 'tv' ? 'tv' : 'movie';
    const tmdbId = match.id;

    // Step 2: Get similar titles
    const similarUrl = `${TMDB_BASE}/${mediaType}/${tmdbId}/similar?api_key=${apiKey}&page=1`;
    const similarResp = await fetch(similarUrl);
    if (similarResp.ok) {
      const similarData = await similarResp.json();
      for (const item of (similarData.results || []) as TMDBMovie[]) {
        const name = item.title || item.name || '';
        const date = item.release_date || item.first_air_date || '';
        const year = date.split('-')[0] || '';
        if (name && (item.popularity ?? 999) < 40) {
          suggestions.set(name, { name, year, popularity: item.popularity ?? 0 });
        }
      }
    }

    // Step 3: Get TMDB recommendations
    const recUrl = `${TMDB_BASE}/${mediaType}/${tmdbId}/recommendations?api_key=${apiKey}&page=1`;
    const recResp = await fetch(recUrl);
    if (recResp.ok) {
      const recData = await recResp.json();
      for (const item of (recData.results || []) as TMDBMovie[]) {
        const name = item.title || item.name || '';
        const date = item.release_date || item.first_air_date || '';
        const year = date.split('-')[0] || '';
        if (name && (item.popularity ?? 999) < 50) {
          suggestions.set(name, { name, year, popularity: item.popularity ?? 0 });
        }
      }
    }

    // Step 4: Discover obscure horror movies (genre 27 = horror)
    // If we know the input year, bias discovery toward a similar era range (±10 years)
    let discoverDateFilter = '';
    if (inputYear) {
      const fromYear = Math.max(1920, inputYear - 10);
      const toYear = Math.min(new Date().getFullYear(), inputYear + 10);
      discoverDateFilter = `&primary_release_date.gte=${fromYear}-01-01&primary_release_date.lte=${toYear}-12-31`;
    }
    const discoverUrl = `${TMDB_BASE}/discover/movie?api_key=${apiKey}&with_genres=27&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=500&vote_average.gte=6${discoverDateFilter}&page=1`;
    const discoverResp = await fetch(discoverUrl);
    if (discoverResp.ok) {
      const discoverData = await discoverResp.json();
      for (const item of (discoverData.results || []).slice(0, 15) as TMDBMovie[]) {
        const name = item.title || item.name || '';
        const date = item.release_date || item.first_air_date || '';
        const year = date.split('-')[0] || '';
        if (name) {
          suggestions.set(name, { name, year, popularity: item.popularity ?? 0 });
        }
      }
    }

    // Step 5: Discover obscure horror TV shows (genre 9648 = mystery)
    let discoverTvDateFilter = '';
    if (inputYear) {
      const fromYear = Math.max(1950, inputYear - 10);
      const toYear = Math.min(new Date().getFullYear(), inputYear + 10);
      discoverTvDateFilter = `&first_air_date.gte=${fromYear}-01-01&first_air_date.lte=${toYear}-12-31`;
    }
    const discoverTvUrl = `${TMDB_BASE}/discover/tv?api_key=${apiKey}&with_genres=9648&sort_by=vote_average.desc&vote_count.gte=20&vote_count.lte=300&vote_average.gte=6.5${discoverTvDateFilter}&page=1`;
    const discoverTvResp = await fetch(discoverTvUrl);
    if (discoverTvResp.ok) {
      const discoverTvData = await discoverTvResp.json();
      for (const item of (discoverTvData.results || []).slice(0, 10) as TMDBMovie[]) {
        const name = item.title || item.name || '';
        const date = item.release_date || item.first_air_date || '';
        const year = date.split('-')[0] || '';
        if (name) {
          suggestions.set(name, { name, year, popularity: item.popularity ?? 0 });
        }
      }
    }

    // Sort by lowest popularity (most obscure first) and return as formatted strings
    const sorted = Array.from(suggestions.values())
      .sort((a, b) => a.popularity - b.popularity)
      .slice(0, 30);

    return {
      suggestions: sorted.map((s) => s.year ? `${s.name} (${s.year})` : s.name),
      inputYear,
      inputDecade,
    };
  } catch (err) {
    console.error('[RECOMMEND] TMDB suggestion fetch error:', err);
    return { suggestions: [], inputYear: null, inputDecade: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, exclude = [], year: userYear, director: userDirector } = await req.json();

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ONSPACE_AI_API_KEY');
    const baseUrl = Deno.env.get('ONSPACE_AI_BASE_URL');
    const tmdbApiKey = Deno.env.get('TMDB_API_KEY');

    if (!apiKey || !baseUrl) {
      throw new Error('OnSpace AI is not configured');
    }

    // Fetch TMDB suggestions in parallel with building the AI request
    let tmdbContext = '';
    let eraContext = '';
    let directorContext = '';
    let inputYear: number | null = userYear ? parseInt(String(userYear), 10) || null : null;
    const directorName = userDirector && typeof userDirector === 'string' ? userDirector.trim() : null;

    if (directorName) {
      directorContext = `\n\nIMPORTANT DIRECTOR CONTEXT: The user specified director "${directorName}". You MUST factor this into your recommendations:\n- At least 4-5 of the 12 recommendations should be OTHER films/shows directed by ${directorName}\n- The remaining can be from other directors IF they share strong thematic, visual, or tonal similarities with ${directorName}'s work\n- When calculating matchPercent, give a boost (+5-10%) to other works by ${directorName}\n- Mention the director connection in descriptions when relevant`;
    }
    if (tmdbApiKey) {
      const tmdbResult = await fetchTMDBSuggestions(title.trim(), tmdbApiKey);
      // User-specified year takes priority, otherwise use TMDB-detected year
      if (!inputYear) inputYear = tmdbResult.inputYear;
      // Override TMDB decade context if user specified a year
      if (userYear && inputYear) {
        const decadeStart = Math.floor(inputYear / 10) * 10;
        tmdbResult.inputDecade = `${decadeStart}s`;
        tmdbResult.inputYear = inputYear;
      }
      console.log(`[RECOMMEND] TMDB provided ${tmdbResult.suggestions.length} obscure suggestions, input year: ${inputYear}, decade: ${tmdbResult.inputDecade}, user-specified: ${!!userYear}`);

      if (tmdbResult.suggestions.length > 0) {
        tmdbContext = `\n\nHere are lesser-known/obscure horror titles from TMDB that are related or similar in theme. You SHOULD draw from this list for at least 6 of your 12 recommendations (if they are genuinely relevant and scary). You may also include titles not on this list if they fit well:\n${tmdbResult.suggestions.join('\n')}`;
      }

      if (tmdbResult.inputYear && tmdbResult.inputDecade) {
        eraContext = `\n\nIMPORTANT ERA CONTEXT: The searched title "${title.trim()}" was released in ${tmdbResult.inputYear} (${tmdbResult.inputDecade}). You MUST factor this into your recommendations:
- At least 4-5 of the 12 recommendations should be from a similar era (within roughly ±10 years of ${tmdbResult.inputYear})
- The remaining can span other decades if they are thematically strong matches
- When calculating matchPercent, give a slight boost (+5-10%) to titles from the same era/decade
- Mention the era/year context in your descriptions when relevant (e.g., "Like the searched title, this ${tmdbResult.inputDecade} gem...")`;
      }
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `You are a horror movie and TV show recommendation expert who specializes in deep cuts, cult classics, indie horror, foreign horror, and overlooked gems — not just mainstream Hollywood hits.

When given a movie or TV show title, recommend exactly 12 similar scary/horror movies or shows. Pay close attention to the ERA and release period of the input title — viewers often want recommendations that feel like they belong to the same filmmaking era (similar practical effects, pacing, cinematography style, cultural context).${eraContext}${directorContext}

Your recommendations MUST follow this mix:
- At least 6 should be OBSCURE, CULT, INDIE, or LESSER-KNOWN titles (films with smaller audiences, limited theatrical runs, festival favorites, international horror, direct-to-streaming gems, or titles most casual horror fans would not know)
- The remaining can be more well-known IF they are highly relevant
- NEVER recommend obvious mainstream blockbusters like The Conjuring, It, A Quiet Place, Get Out, Hereditary, Midsommar, Scream, Halloween, etc. UNLESS the user specifically searched for something in that exact franchise
- Prioritize: international horror (Korean, Japanese, French, Spanish, Thai, etc.), A24/indie horror, 70s-80s deep cuts, direct-to-video cult classics, festival horror, and anthology series

For each recommendation, provide:
- title: The exact title as it appears on TMDB/IMDB (use the English title or most common international title)
- year: Release year
- description: A 2-3 sentence description focusing on why it is scary and how it relates to the input. Mention what makes it a hidden gem or why horror fans seek it out.
- type: "movie" or "tv"
- streamingOn: An array of 1-3 streaming platforms where it is likely available (e.g. ["Shudder", "Tubi", "AMC+"])
- matchPercent: An integer from 50 to 99 representing how similar this recommendation is to the input title. Vary the values realistically.

Do NOT recommend any of the following titles (already shown or searched for): ${[title.trim(), ...exclude].join(', ')}.${tmdbContext}

Remember: era/release date matters. If the input is from the 1980s, lean toward 70s-90s horror. If from the 2010s, lean toward 2000s-2020s. Always include some era-matched picks.

Return ONLY valid JSON. No markdown, no explanation.`,
          },
          {
            role: 'user',
            content: `Recommend 12 scary movies or TV shows similar to: "${title.trim()}"${inputYear ? ` (${inputYear})` : ''}${directorName ? ` directed by ${directorName}` : ''}. Focus on obscure and lesser-known horror that fans of "${title.trim()}" would love to discover.${inputYear ? ` The user specifically indicated the ${inputYear} version/era, so weight recommendations toward that time period.` : ''}${directorName ? ` The user is specifically interested in works by or similar to director ${directorName}.` : ''}`,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'return_recommendations',
              description: 'Return 12 horror movie/show recommendations with a focus on obscure and lesser-known titles',
              parameters: {
                type: 'object',
                properties: {
                  recommendations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        year: { type: 'number' },
                        description: { type: 'string' },
                        type: { type: 'string', enum: ['movie', 'tv'] },
                        streamingOn: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        matchPercent: {
                          type: 'number',
                          description: 'Similarity percentage from 50-99',
                        },
                      },
                      required: [
                        'title',
                        'year',
                        'description',
                        'type',
                        'streamingOn',
                        'matchPercent',
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['recommendations'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: 'function',
          function: { name: 'return_recommendations' },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limited, please try again shortly.' }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      const t = await response.text();
      console.error('AI error:', response.status, t);
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('No tool call in response');

    const parsed = JSON.parse(toolCall.function.arguments);
    const inputTitleLower = title.trim().toLowerCase();
    const recommendations = parsed.recommendations
      .filter((rec: Record<string, unknown>) =>
        (rec.title as string || '').toLowerCase() !== inputTitleLower
      )
      .map((rec: Record<string, unknown>, index: number) => ({
        ...rec,
        id: `ai_${Date.now()}_${index}`,
        posterUrl: null,
      }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((b.matchPercent as number) || 0) - ((a.matchPercent as number) || 0)
      );

    return new Response(JSON.stringify({ recommendations, inputYear }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('recommend error:', e);
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
