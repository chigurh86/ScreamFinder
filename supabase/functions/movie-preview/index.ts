import { corsHeaders } from '../_shared/cors.ts';

/**
 * ScreamFinder — Movie Preview page
 * ---------------------------------
 * Serves a mobile-optimised HTML page for a single movie/TV recommendation.
 * The URL to this page is embedded in shared messages (iMessage, WhatsApp,
 * SMS, etc.), so those apps fetch this page and use the Open Graph meta
 * tags to build the rich preview card (poster + title + description).
 *
 * When the recipient taps the card:
 *   1. If they have ScreamFinder installed AND Universal Links are set up
 *      (post App Store approval + apple-app-site-association file on this
 *      domain), iOS opens the app directly.
 *   2. Otherwise, they land here in Safari and see a "Get ScreamFinder"
 *      button that takes them to the App Store.
 *
 * TO ACTIVATE FULL APP-STORE FLOW POST-APPROVAL:
 *   - Set APP_STORE_URL to the real listing (e.g. https://apps.apple.com/app/id1234567890)
 *   - Set APP_STORE_ID to the numeric ID (enables iOS Smart App Banner)
 *   - (Optional) Add apple-app-site-association JSON to this backend domain
 *     for Universal Links so taps open the installed app directly.
 */

// -------- App-Store configuration (edit after approval) ---------------------
// Fallback until the app is live on the App Store. The search page is a
// friendly landing that lets users find the app even without a direct link.
const APP_STORE_URL = 'https://apps.apple.com/search?term=ScreamFinder+horror';
// Numeric App Store ID — leave blank until Apple assigns one, then fill in
// (e.g. '1234567890') to enable iOS Smart App Banner in Safari.
const APP_STORE_ID = '';
// Play Store URL — placeholder until Android is submitted.
const PLAY_STORE_URL = 'https://play.google.com/store/search?q=ScreamFinder+horror&c=apps';
// Custom URL scheme registered in app.json. Used to try opening the app
// on-device before falling back to a landing page.
const APP_SCHEME = 'screamfinder://';
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(str: string, max = 300): string {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '\u2026';
}

interface PageParams {
  title: string;
  year: string;
  description: string;
  poster: string;
  type: string;
  platforms: string[];
  rating: string;
}

function buildHtml(params: PageParams): string {
  const displayTitle = params.title || 'Horror Recommendation';
  const displayYear = params.year || '';
  const displayDesc = truncate(
    params.description || 'A horror recommendation from ScreamFinder.',
    300,
  );
  const displayType = params.type === 'tv' ? 'TV Series' : 'Feature Film';
  const displayPoster = params.poster || '';
  const displayPlatforms = params.platforms.filter(Boolean);
  const displayRating = params.rating || '';

  const pageTitle = displayYear
    ? `${displayTitle} (${displayYear}) \u2014 ScreamFinder`
    : `${displayTitle} \u2014 ScreamFinder`;

  const ogTitle = displayYear
    ? `${displayTitle} (${displayYear})`
    : displayTitle;

  const smartBanner = APP_STORE_ID
    ? `<meta name="apple-itunes-app" content="app-id=${escapeHtml(APP_STORE_ID)}">`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="theme-color" content="#0A0A0F">
  <title>${escapeHtml(pageTitle)}</title>

  <!-- Open Graph tags — iMessage, WhatsApp, Facebook, Signal, LinkedIn -->
  <meta property="og:type" content="video.other">
  <meta property="og:site_name" content="ScreamFinder">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(displayDesc)}">
  ${displayPoster ? `<meta property="og:image" content="${escapeHtml(displayPoster)}">` : ''}
  ${displayPoster ? `<meta property="og:image:width" content="500">` : ''}
  ${displayPoster ? `<meta property="og:image:height" content="750">` : ''}
  ${displayPoster ? `<meta property="og:image:alt" content="${escapeHtml(displayTitle)} poster">` : ''}

  <!-- Twitter Card tags — used by X/Twitter and several messaging apps -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(displayDesc)}">
  ${displayPoster ? `<meta name="twitter:image" content="${escapeHtml(displayPoster)}">` : ''}

  <!-- iOS Smart App Banner. Activates once APP_STORE_ID is set. -->
  ${smartBanner}

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0A0A0F;
      color: #E5E5E7;
      line-height: 1.6;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }

    .wrap { max-width: 480px; margin: 0 auto; padding: 16px; }

    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 0 20px;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .brand .drop { font-size: 20px; }
    .brand .scream { color: #DC2626; }
    .brand .finder { color: #E5E5E7; }

    .card {
      background: #16161C;
      border: 1px solid #26262F;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .poster-wrap {
      width: 100%;
      aspect-ratio: 2 / 3;
      background: #26262F;
      overflow: hidden;
      position: relative;
    }
    .poster {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .poster-placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6B6B75;
      font-size: 15px;
      padding: 20px;
      text-align: center;
    }
    .info { padding: 20px; }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .type-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      color: #22C55E;
      background: rgba(34, 197, 94, 0.15);
      padding: 4px 10px;
      border-radius: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .rating-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #FCD34D;
      background: rgba(252, 211, 77, 0.12);
      font-weight: 700;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 8px;
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      color: #FFFFFF;
      margin: 0 0 4px;
      line-height: 1.15;
    }
    .year { color: #8B8B95; font-size: 15px; margin-bottom: 14px; }
    .desc {
      color: #B4B4BE;
      font-size: 14.5px;
      line-height: 1.6;
      margin: 12px 0 18px;
    }
    .platforms-label {
      font-size: 11px;
      color: #8B8B95;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .platforms {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .platform {
      background: rgba(220, 38, 38, 0.15);
      border: 1px solid rgba(220, 38, 38, 0.35);
      color: #F87171;
      padding: 5px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 600;
    }

    .cta { margin-top: 22px; }
    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: linear-gradient(180deg, #DC2626 0%, #991B1B 100%);
      color: #FFFFFF;
      font-size: 17px;
      font-weight: 800;
      padding: 18px 20px;
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(220, 38, 38, 0.45);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 36px rgba(220, 38, 38, 0.55);
    }
    .btn-primary:active { transform: translateY(0); }
    .btn-secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: transparent;
      color: #8B8B95;
      font-size: 14px;
      font-weight: 600;
      padding: 12px 20px;
      margin-top: 10px;
      border-radius: 12px;
      border: 1px solid #26262F;
    }

    .footer {
      text-align: center;
      padding: 28px 0 40px;
      color: #6B6B75;
      font-size: 13px;
    }
    .footer p { margin: 4px 0; }
    .footer a { color: #DC2626; font-weight: 600; }

    @media (max-width: 400px) {
      h1 { font-size: 22px; }
      .info { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <span class="drop">\ud83e\ude78</span>
      <span class="scream">SCREAM</span><span class="finder">FINDER</span>
    </div>

    <div class="card">
      <div class="poster-wrap">
        ${
          displayPoster
            ? `<img src="${escapeHtml(displayPoster)}" alt="${escapeHtml(displayTitle)} poster" class="poster" loading="eager">`
            : `<div class="poster-placeholder">${escapeHtml(displayTitle)}</div>`
        }
      </div>

      <div class="info">
        <div class="row">
          <span class="type-badge">${escapeHtml(displayType)}</span>
          ${displayRating ? `<span class="rating-badge">\u2605 ${escapeHtml(displayRating)}/10</span>` : ''}
        </div>
        <h1>${escapeHtml(displayTitle)}</h1>
        ${displayYear ? `<div class="year">${escapeHtml(displayYear)}</div>` : ''}
        ${displayDesc ? `<p class="desc">${escapeHtml(displayDesc)}</p>` : ''}

        ${
          displayPlatforms.length > 0
            ? `<div class="platforms-label">Streaming on</div>
               <div class="platforms">
                 ${displayPlatforms.map((p) => `<span class="platform">${escapeHtml(p)}</span>`).join('')}
               </div>`
            : ''
        }
      </div>
    </div>

    <div class="cta">
      <a id="get-app" href="${escapeHtml(APP_STORE_URL)}" class="btn-primary">
        <span>\ud83d\udcf1</span> Get ScreamFinder
      </a>
      <a href="${escapeHtml(PLAY_STORE_URL)}" class="btn-secondary" id="get-android">
        Available on Android too
      </a>
    </div>

    <div class="footer">
      <p>Discover, save, and share horror recommendations.</p>
      <p><a href="${escapeHtml(APP_STORE_URL)}">Download the app</a></p>
    </div>
  </div>

  <script>
    (function () {
      var ua = navigator.userAgent || '';
      var isIOS = /iPhone|iPad|iPod/.test(ua);
      var isAndroid = /Android/.test(ua);

      // Show the correct store button per platform.
      try {
        var androidBtn = document.getElementById('get-android');
        if (isIOS && androidBtn) androidBtn.style.display = 'none';
        var iosBtn = document.getElementById('get-app');
        if (isAndroid && iosBtn) {
          iosBtn.setAttribute('href', ${JSON.stringify(PLAY_STORE_URL)});
          iosBtn.innerHTML = '<span>\ud83d\udcf1</span> Get ScreamFinder on Google Play';
          if (androidBtn) androidBtn.style.display = 'none';
        }
      } catch (e) { /* no-op */ }

      // Attempt to open the installed app via its custom scheme.
      // If Universal Links are configured post App Store approval, iOS will
      // intercept the tap and open the app directly (so this block never
      // fires). Until then, we try the scheme once per visit.
      if (!isIOS && !isAndroid) return;
      try {
        if (sessionStorage.getItem('sf_opened')) return;
        sessionStorage.setItem('sf_opened', '1');
        setTimeout(function () {
          try { window.location.href = ${JSON.stringify(APP_SCHEME)}; } catch (e) {}
        }, 150);
      } catch (e) { /* no-op */ }
    })();
  </script>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const q = url.searchParams;

    const params: PageParams = {
      title: q.get('t') || q.get('title') || '',
      year: q.get('y') || q.get('year') || '',
      description: q.get('d') || q.get('desc') || '',
      poster: q.get('p') || q.get('poster') || '',
      type: q.get('type') || 'movie',
      platforms: (q.get('s') || q.get('platforms') || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      rating: q.get('r') || q.get('rating') || '',
    };

    const html = buildHtml(params);

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        // Cache identical preview URLs for 1 hour to keep the page snappy
        // when many people tap the same shared card.
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Error rendering preview page', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
});
