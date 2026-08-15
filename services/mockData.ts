export interface Movie {
  id: string;
  title: string;
  year: number;
  description: string;
  type: 'movie' | 'tv';
  streamingOn: string[];
  posterUrl: string;
  rating?: number;
  tags: string[];
}

const TMDB = (path: string) => `https://image.tmdb.org/t/p/w500${path}`;

/**
 * Each movie now has highly distinctive tags.
 * Tags are split into tiers:
 *   - "DNA tags" (1-3): unique identifiers like director style, specific sub-genre
 *   - "Cluster tags" (2-3): shared with a small group of similar films
 *   - "Broad tags" (2-3): common genre descriptors
 *
 * This ensures that movies within the same cluster score high together,
 * while movies from different clusters score noticeably lower.
 */
export const horrorMovies: Movie[] = [
  {
    id: '1',
    title: 'Hereditary',
    year: 2018,
    description: 'A grieving family is haunted by tragic and disturbing occurrences after the death of their secretive grandmother.',
    type: 'movie',
    streamingOn: ['Amazon Prime', 'Hulu'],
    posterUrl: TMDB('/hjlZSXM86wJrfCv5VKfR5DI2VeU.jpg'),
    rating: 7.3,
    tags: ['aster', 'a24', 'demonic', 'grief', 'family-trauma', 'occult', 'slow-burn', 'psychological'],
  },
  {
    id: '2',
    title: 'The Haunting of Hill House',
    year: 2018,
    description: 'Flashing between past and present, a fractured family confronts haunting memories of their old home and the terrifying events that drove them from it.',
    type: 'tv',
    streamingOn: ['Netflix'],
    posterUrl: TMDB('/38PkhBGRQtmVx2drvPik3F42qHO.jpg'),
    rating: 8.6,
    tags: ['flanagan', 'haunted-house', 'ghost', 'family-trauma', 'grief', 'drama', 'nonlinear', 'emotional'],
  },
  {
    id: '3',
    title: 'Midsommar',
    year: 2019,
    description: 'A couple travels to Northern Europe to visit a rural hometown\'s fabled Swedish mid-summer festival. What begins as an idyllic retreat quickly devolves into an increasingly violent and bizarre competition.',
    type: 'movie',
    streamingOn: ['Amazon Prime'],
    posterUrl: TMDB('/7LEI8ulZzO5gy9Ww2NVCrKmHeDZ.jpg'),
    rating: 7.1,
    tags: ['aster', 'a24', 'folk-horror', 'daylight-horror', 'cult-ritual', 'grief', 'breakup', 'european'],
  },
  {
    id: '4',
    title: 'The Witch',
    year: 2015,
    description: 'A family in 1630s New England is torn apart by the forces of witchcraft, black magic, and possession.',
    type: 'movie',
    streamingOn: ['Netflix', 'Amazon Prime'],
    posterUrl: TMDB('/zap5hpFCWSvdWSuPGAQyjUv2wAC.jpg'),
    rating: 6.9,
    tags: ['eggers', 'a24', 'folk-horror', 'period-piece', 'witchcraft', 'puritanism', 'isolation', 'slow-burn'],
  },
  {
    id: '5',
    title: 'Midnight Mass',
    year: 2021,
    description: 'The arrival of a charismatic young priest brings glorious miracles, ominous mysteries and renewed religious fervor to a dying town desperate to believe.',
    type: 'tv',
    streamingOn: ['Netflix'],
    posterUrl: TMDB('/750OTr2OFfmJI4LNWwkJbKURLmo.jpg'),
    rating: 7.7,
    tags: ['flanagan', 'religious-horror', 'vampire', 'small-town', 'philosophical', 'slow-burn', 'drama', 'faith'],
  },
  {
    id: '6',
    title: 'It Follows',
    year: 2014,
    description: 'A young woman is followed by an unknown supernatural force after a sexual encounter.',
    type: 'movie',
    streamingOn: ['Hulu', 'Tubi'],
    posterUrl: TMDB('/4MKhFAMiO6PY0dDPGnOUFKj8Nml.jpg'),
    rating: 6.8,
    tags: ['indie-horror', 'curse', 'teen', 'synth-score', 'allegorical', 'atmospheric', 'slow-burn', 'minimalist'],
  },
  {
    id: '7',
    title: 'The Conjuring',
    year: 2013,
    description: 'Paranormal investigators Ed and Lorraine Warren work to help a family terrorized by a dark presence in their farmhouse.',
    type: 'movie',
    streamingOn: ['HBO Max', 'Netflix'],
    posterUrl: TMDB('/wVYREutTvI2tmxr6ujrHT704wGF.jpg'),
    rating: 7.5,
    tags: ['wan', 'haunted-house', 'demonic', 'possession', 'jump-scare', 'paranormal-investigation', 'mainstream', 'ghost'],
  },
  {
    id: '8',
    title: 'Stranger Things',
    year: 2016,
    description: 'When a young boy disappears, his mother, a police chief and his friends must confront terrifying supernatural forces in order to get him back.',
    type: 'tv',
    streamingOn: ['Netflix'],
    posterUrl: TMDB('/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg'),
    rating: 8.7,
    tags: ['sci-fi', 'retro-80s', 'teen', 'adventure', 'government-conspiracy', 'upside-down', 'small-town', 'creature'],
  },
  {
    id: '9',
    title: 'Get Out',
    year: 2017,
    description: 'A young African-American visits his white girlfriend\'s parents for the weekend, where his simmering uneasiness about their reception of him eventually reaches a boiling point.',
    type: 'movie',
    streamingOn: ['Amazon Prime', 'Peacock'],
    posterUrl: TMDB('/mE24wUCfjK8AoBBjaMjho7Rczr7.jpg'),
    rating: 7.7,
    tags: ['peele', 'social-horror', 'satire', 'mind-control', 'cerebral', 'racial-commentary', 'thriller', 'twist'],
  },
  {
    id: '10',
    title: 'The Babadook',
    year: 2014,
    description: 'A single mother and her child fall into a deep well of paranoia when an eerie children\'s book titled "Mister Babadook" manifests in their home.',
    type: 'movie',
    streamingOn: ['Shudder', 'Tubi'],
    posterUrl: TMDB('/qt3fqapeo94TfvMyld8P7gkpXLz.jpg'),
    rating: 6.8,
    tags: ['grief', 'motherhood', 'psychological', 'indie-horror', 'allegorical', 'emotional', 'monster-metaphor', 'australian'],
  },
  {
    id: '11',
    title: 'A Quiet Place',
    year: 2018,
    description: 'In a post-apocalyptic world, a family is forced to live in silence while hiding from monsters with ultra-sensitive hearing.',
    type: 'movie',
    streamingOn: ['Paramount+', 'Amazon Prime'],
    posterUrl: TMDB('/nAU74GmpUk7t5iklEp3bufwDq4n.jpg'),
    rating: 7.5,
    tags: ['creature', 'survival', 'post-apocalyptic', 'family-protection', 'tension', 'mainstream', 'sci-fi', 'silence-concept'],
  },
  {
    id: '12',
    title: 'Marianne',
    year: 2019,
    description: 'A famous horror writer discovers that the evil spirit that plagues her dreams is real and has been terrorizing her small hometown.',
    type: 'tv',
    streamingOn: ['Netflix'],
    posterUrl: TMDB('/bJprwRUzVXpOl7vpjKMwfNDiXJq.jpg'),
    rating: 7.4,
    tags: ['demonic', 'possession', 'european', 'small-town', 'witchcraft', 'ghost', 'french-horror', 'jump-scare'],
  },
  {
    id: '13',
    title: 'Us',
    year: 2019,
    description: 'A family\'s serene beach vacation turns to chaos when their doppelgangers appear and begin to terrorize them.',
    type: 'movie',
    streamingOn: ['Amazon Prime', 'Hulu'],
    posterUrl: TMDB('/ux2dU1jQ2ACIMShzB3yP93Udpzc.jpg'),
    rating: 6.8,
    tags: ['peele', 'social-horror', 'doppelganger', 'home-invasion', 'allegorical', 'class-commentary', 'thriller', 'twist'],
  },
  {
    id: '14',
    title: 'The Terror',
    year: 2018,
    description: 'A chilling anthology series featuring stories of survival in unforgiving environments with a supernatural twist.',
    type: 'tv',
    streamingOn: ['Hulu', 'AMC+'],
    posterUrl: TMDB('/5mJHjMdeeUWVp4gCHdWEZsjfuST.jpg'),
    rating: 7.9,
    tags: ['period-piece', 'survival', 'isolation', 'historical', 'creature', 'arctic', 'slow-burn', 'bleak'],
  },
  {
    id: '15',
    title: 'Suspiria',
    year: 2018,
    description: 'A darkness swirls at the center of a world-renowned dance company, one that will engulf the artistic director, an ambitious young dancer, and a grieving psychotherapist.',
    type: 'movie',
    streamingOn: ['Amazon Prime'],
    posterUrl: TMDB('/jGWaz3oqdRJnBtfIGbEneOWXQe9.jpg'),
    rating: 6.8,
    tags: ['witchcraft', 'european', 'art-house', 'body-horror', 'cult-ritual', 'dance', 'giallo-remake', 'slow-burn'],
  },
  {
    id: '16',
    title: 'Brand New Cherry Flavor',
    year: 2021,
    description: 'A filmmaker goes to Hollywood in the early \'90s to make her movie but tumbles down a hallucinatory rabbit hole of sex, magic, and revenge.',
    type: 'tv',
    streamingOn: ['Netflix'],
    posterUrl: TMDB('/acYCz70NDEQFQ0A3lGU0XkCVem5.jpg'),
    rating: 6.8,
    tags: ['witchcraft', 'body-horror', 'surreal', 'revenge', 'curse', 'hollywood-satire', 'hallucinatory', 'art-house'],
  },
  {
    id: '17',
    title: 'The Lighthouse',
    year: 2019,
    description: 'Two lighthouse keepers try to maintain their sanity while living on a remote and mysterious New England island in the 1890s.',
    type: 'movie',
    streamingOn: ['Amazon Prime', 'Hulu'],
    posterUrl: TMDB('/f1tIYarTbkBdIT1aW0gzelDwknv.jpg'),
    rating: 7.5,
    tags: ['eggers', 'a24', 'isolation', 'madness', 'period-piece', 'two-hander', 'mythological', 'black-and-white'],
  },
  {
    id: '18',
    title: 'Servant',
    year: 2019,
    description: 'A Philadelphia couple is in mourning after an unspeakable tragedy creates a rift in their marriage and opens the door for a mysterious force to enter their home.',
    type: 'tv',
    streamingOn: ['Apple TV+'],
    posterUrl: TMDB('/5z7WBp4uOJzBGiRMSeGpnz9gJIQ.jpg'),
    rating: 7.5,
    tags: ['grief', 'psychological', 'cult-ritual', 'shyamalan', 'mystery', 'domestic', 'slow-burn', 'emotional'],
  },
  {
    id: '19',
    title: 'Pearl',
    year: 2022,
    description: 'Trapped on her family\'s isolated farm, Pearl must tend to her ailing father under the oppressive watch of her devout mother.',
    type: 'movie',
    streamingOn: ['Amazon Prime', 'Hulu'],
    posterUrl: TMDB('/5kcMgWRhkzjtOLmO9ooGMWpCaVq.jpg'),
    rating: 7.0,
    tags: ['a24', 'slasher', 'period-piece', 'character-study', 'isolation', 'madness', 'technicolor', 'origin-story'],
  },
  {
    id: '20',
    title: 'Archive 81',
    year: 2022,
    description: 'An archivist takes a job restoring damaged videotapes and gets pulled into the mystery surrounding the filmmaker and a dangerous cult.',
    type: 'tv',
    streamingOn: ['Netflix'],
    posterUrl: TMDB('/eoJGLPar02FJFu79MIgQJIBqUqt.jpg'),
    rating: 7.4,
    tags: ['found-footage', 'cult-ritual', 'cosmic-horror', 'mystery', 'demonic', 'lovecraftian', 'dual-timeline', 'occult'],
  },
  {
    id: '21',
    title: 'Smile',
    year: 2022,
    description: 'After witnessing a bizarre, traumatic incident involving a patient, a psychiatrist becomes increasingly convinced she is being threatened by an uncanny entity.',
    type: 'movie',
    streamingOn: ['Paramount+', 'Amazon Prime'],
    posterUrl: TMDB('/aPqcQwu4VGEewPhagWNncDbJ9Xp.jpg'),
    rating: 6.5,
    tags: ['curse', 'mainstream', 'jump-scare', 'trauma', 'chain-curse', 'psychiatric', 'entity', 'tension'],
  },
  {
    id: '22',
    title: 'Nope',
    year: 2022,
    description: 'The residents of a lonely gulch in inland California bear witness to an uncanny and chilling discovery.',
    type: 'movie',
    streamingOn: ['Peacock', 'Amazon Prime'],
    posterUrl: TMDB('/AcKVlWaNVVVFQwro3nLXqPljcYA.jpg'),
    rating: 6.8,
    tags: ['peele', 'sci-fi', 'social-horror', 'spectacle', 'ufo', 'cerebral', 'creature', 'exploitation-theme'],
  },
  {
    id: '23',
    title: 'Chapelwaite',
    year: 2021,
    description: 'In the 1850s, Captain Charles Boone relocates his family to his ancestral home in the small, seemingly sleepy town of Preacher\'s Corners, Maine.',
    type: 'tv',
    streamingOn: ['AMC+'],
    posterUrl: TMDB('/wy3WtyTgjCvJMlPQ5aPRvKlToXu.jpg'),
    rating: 6.7,
    tags: ['stephen-king', 'period-piece', 'vampire', 'gothic', 'small-town', 'family-legacy', 'new-england', 'atmospheric'],
  },
  {
    id: '24',
    title: 'Talk to Me',
    year: 2023,
    description: 'When a group of friends discover how to conjure spirits using an embalmed hand, they become hooked on the new thrill, until one of them goes too far.',
    type: 'movie',
    streamingOn: ['Amazon Prime', 'Paramount+'],
    posterUrl: TMDB('/kdPMUMJzyYAc4roD52qavX0nLIC.jpg'),
    rating: 7.1,
    tags: ['a24', 'possession', 'teen', 'ghost', 'social-media-era', 'grief', 'australian', 'jump-scare'],
  },
  {
    id: '25',
    title: 'From',
    year: 2022,
    description: 'Unravels the mystery of a nightmarish town in middle America that traps all those who enter.',
    type: 'tv',
    streamingOn: ['Amazon Prime'],
    posterUrl: TMDB('/cjXLrg4R7FRPFafvuQ3SSznMSMF.jpg'),
    rating: 7.6,
    tags: ['mystery-box', 'creature', 'survival', 'small-town', 'trapped', 'sci-fi', 'ensemble', 'ongoing-mystery'],
  },
];

// ─── Tag rarity index (computed once) ───────────────────────────────────────
// Tags that appear in fewer movies are worth more when matched.
// This is the core fix: "supernatural" appearing in 15 movies is worth almost
// nothing, while "aster" appearing in 2 movies is a very strong signal.

const tagFrequency: Record<string, number> = {};
for (const movie of horrorMovies) {
  for (const tag of movie.tags) {
    tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
  }
}

const TOTAL_MOVIES = horrorMovies.length;

/** Returns an IDF-like weight: rare tags score high, common tags score low */
function tagWeight(tag: string): number {
  const freq = tagFrequency[tag] || 1;
  // log(total / freq) gives: freq=1 → 3.2, freq=2 → 2.5, freq=5 → 1.6, freq=10 → 0.9, freq=15 → 0.5
  return Math.log2(TOTAL_MOVIES / freq);
}

// ─── Affinity groups ────────────────────────────────────────────────────────
// Movies that share a director/style get a direct bonus even beyond tags.
const AFFINITY_GROUPS: string[][] = [
  ['Hereditary', 'Midsommar'],                             // Ari Aster
  ['The Witch', 'The Lighthouse'],                         // Robert Eggers
  ['Get Out', 'Us', 'Nope'],                               // Jordan Peele
  ['The Haunting of Hill House', 'Midnight Mass'],          // Mike Flanagan
  ['Suspiria', 'Brand New Cherry Flavor'],                  // witchcraft + body-horror + art-house
  ['The Conjuring', 'Smile', 'Talk to Me'],                // mainstream jump-scare
  ['The Terror', 'Chapelwaite'],                            // period-piece + bleak atmosphere
  ['It Follows', 'The Babadook'],                           // indie allegorical horror
  ['Stranger Things', 'From'],                              // mystery-creature-town ensemble
  ['Archive 81', 'Servant'],                                // slow mystery cult
];

function getAffinityBonus(sourceTitle: string, candidateTitle: string): number {
  for (const group of AFFINITY_GROUPS) {
    if (group.includes(sourceTitle) && group.includes(candidateTitle)) {
      return 25; // strong signal: same creative DNA
    }
  }
  return 0;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function computeRelevanceScore(source: Movie, candidate: Movie): number {
  let score = 0;

  // 1. Weighted tag overlap (the main differentiator)
  for (const tag of source.tags) {
    if (candidate.tags.includes(tag)) {
      score += tagWeight(tag) * 5; // rare match = ~16 pts, common match = ~2.5 pts
    }
  }

  // 2. Affinity group bonus
  score += getAffinityBonus(source.title, candidate.title);

  // 3. Same type (movie vs tv) - moderate
  if (source.type === candidate.type) {
    score += 4;
  }

  // 4. Year proximity
  const yearDiff = Math.abs(source.year - candidate.year);
  if (yearDiff <= 1) score += 5;
  else if (yearDiff <= 3) score += 3;
  else if (yearDiff <= 6) score += 1;

  // 5. Shared streaming (minor convenience)
  const sharedPlatforms = source.streamingOn.filter((p) =>
    candidate.streamingOn.includes(p)
  );
  score += sharedPlatforms.length * 1;

  // 6. Tiny random jitter (just enough to break ties, not override real signal)
  score += Math.random() * 1.5;

  return score;
}

export function getRecommendations(
  searchQuery: string,
  excludeTitles: string[] = [],
  count: number = 10
): Movie[] {
  const query = searchQuery.toLowerCase();

  // Find source movie (exact or partial title match)
  const sourceMovie =
    horrorMovies.find((m) => m.title.toLowerCase() === query) ||
    horrorMovies.find(
      (m) =>
        m.title.toLowerCase().includes(query) ||
        query.includes(m.title.toLowerCase())
    );

  // Candidates: exclude the searched title and already-shown
  const candidates = horrorMovies.filter(
    (m) =>
      !excludeTitles.includes(m.title) &&
      !m.title.toLowerCase().includes(query) &&
      !query.includes(m.title.toLowerCase())
  );

  if (sourceMovie) {
    const scored = candidates.map((m) => ({
      movie: m,
      score: computeRelevanceScore(sourceMovie, m),
    }));
    scored.sort((a, b) => b.score - a.score);

    const topResults = scored.slice(0, count).map((s) => s.movie);

    // Recycle if pool is exhausted
    if (topResults.length < count) {
      const allExceptQuery = horrorMovies.filter(
        (m) =>
          !m.title.toLowerCase().includes(query) &&
          !query.includes(m.title.toLowerCase())
      );
      const remaining = count - topResults.length;
      const recycled = allExceptQuery
        .sort(
          (a, b) =>
            computeRelevanceScore(sourceMovie, b) -
            computeRelevanceScore(sourceMovie, a)
        )
        .slice(0, remaining)
        .map((m) => ({
          ...m,
          id: `${m.id}_r${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        }));
      return [...topResults, ...recycled];
    }

    return topResults;
  }

  // ── Fallback: free-text keyword search ──
  const queryWords = query.split(/\s+/).filter((w) => w.length > 2);

  // Expanded keyword-to-tag map
  const keywordTagMap: Record<string, string[]> = {
    ghost: ['ghost', 'haunted-house'],
    demon: ['demonic', 'possession', 'occult'],
    zombie: ['creature', 'survival', 'post-apocalyptic'],
    alien: ['sci-fi', 'ufo', 'creature'],
    witch: ['witchcraft', 'folk-horror', 'cult-ritual'],
    cult: ['cult-ritual', 'occult', 'religious-horror'],
    slasher: ['slasher', 'mainstream', 'jump-scare'],
    psychological: ['psychological', 'cerebral', 'allegorical'],
    haunted: ['haunted-house', 'ghost'],
    possession: ['possession', 'demonic', 'occult'],
    monster: ['creature', 'survival'],
    paranormal: ['ghost', 'haunted-house', 'paranormal-investigation'],
    vampire: ['vampire', 'gothic'],
    scary: ['jump-scare', 'mainstream', 'tension'],
    creepy: ['atmospheric', 'slow-burn'],
    family: ['family-trauma', 'family-protection', 'grief'],
    survival: ['survival', 'creature', 'post-apocalyptic'],
    mystery: ['mystery', 'mystery-box', 'ongoing-mystery'],
    cosmic: ['cosmic-horror', 'lovecraftian'],
    lovecraft: ['lovecraftian', 'cosmic-horror'],
    folk: ['folk-horror', 'witchcraft', 'puritanism'],
    indie: ['indie-horror', 'a24', 'art-house'],
    art: ['art-house', 'allegorical'],
    king: ['stephen-king', 'small-town'],
    stephen: ['stephen-king'],
    social: ['social-horror', 'racial-commentary', 'class-commentary'],
    satire: ['satire', 'social-horror', 'hollywood-satire'],
    found: ['found-footage', 'dual-timeline'],
    period: ['period-piece', 'historical', 'gothic'],
    revenge: ['revenge', 'curse'],
    teen: ['teen', 'social-media-era'],
    religious: ['religious-horror', 'faith'],
    isolation: ['isolation', 'trapped', 'arctic'],
  };

  const scored = candidates.map((m) => {
    let score = 0;
    const lowerDesc = m.description.toLowerCase();
    const lowerTitle = m.title.toLowerCase();

    for (const word of queryWords) {
      if (m.tags.some((t) => t.includes(word))) score += 12;
      if (lowerDesc.includes(word)) score += 5;
      if (lowerTitle.includes(word)) score += 10;

      const mapped = keywordTagMap[word];
      if (mapped) {
        for (const tag of mapped) {
          if (m.tags.includes(tag)) score += tagWeight(tag) * 4;
        }
      }
    }

    score += Math.random() * 1.5;
    return { movie: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, count).map((s) => s.movie);

  if (topResults.length < count) {
    const remaining = count - topResults.length;
    const allOthers = horrorMovies
      .filter((m) => !topResults.some((r) => r.id === m.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, remaining)
      .map((m) => ({
        ...m,
        id: `${m.id}_r${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      }));
    return [...topResults, ...allOthers];
  }

  return topResults;
}
