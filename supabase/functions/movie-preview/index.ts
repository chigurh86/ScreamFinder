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
// Public URL to the real in-app knife-logo.png. Rendered as an <img> at the
// top of the shared movie-preview page. Falls back to the inline SVG wordmark
// below if the file hasn't been uploaded to the 'app-assets' storage bucket
// yet (via OnSpace Cloud → Storage → app-assets → upload knife-logo.png).
const LOGO_URL =
  'https://edrhopkytkvaktededrh.backend.onspace.ai/storage/v1/object/public/app-assets/knife-logo.png';
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
      padding: 12px 0 22px;
    }
    .brand img.brand-logo {
      display: block;
      width: auto;
      height: 96px;
      max-width: 80%;
      object-fit: contain;
      filter: drop-shadow(0 6px 18px rgba(220, 38, 38, 0.4));
    }
    .brand svg {
      display: block;
      width: auto;
      height: 42px;
      max-width: 90%;
      filter: drop-shadow(0 4px 14px rgba(220, 38, 38, 0.35));
    }

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
    <div class="brand" role="img" aria-label="ScreamFinder">
      <!-- Primary: the actual in-app knife-logo.png served from the public app-assets Supabase Storage bucket. -->
      <img
        src="${escapeHtml(LOGO_URL)}"
        alt="ScreamFinder"
        class="brand-logo"
        onerror="this.remove();var f=document.getElementById('brand-svg-fallback');if(f){f.style.display='block';}"
      />
      <!-- Fallback: inline SVG wordmark, shown only if the logo image fails to load (bucket empty, offline, etc.). -->
      <svg id="brand-svg-fallback" style="display:none;" viewBox="0 0 520 96" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#F5F5F7"/>
            <stop offset="55%" stop-color="#D4D4D8"/>
            <stop offset="100%" stop-color="#9CA3AF"/>
          </linearGradient>
          <linearGradient id="handle" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3F3F46"/>
            <stop offset="100%" stop-color="#18181B"/>
          </linearGradient>
          <linearGradient id="bloodDrip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#DC2626"/>
            <stop offset="100%" stop-color="#7F1D1D"/>
          </linearGradient>
        </defs>

        <!-- Knife (blade pointing right, dripping blood) -->
        <g transform="translate(6, 28)">
          <!-- Blade -->
          <path d="M 26 12 L 96 20 L 96 28 L 26 36 L 22 32 L 22 16 Z" fill="url(#blade)" stroke="#71717A" stroke-width="0.8"/>
          <!-- Blade edge highlight -->
          <path d="M 30 15 L 92 22 L 92 24 L 30 20 Z" fill="#FAFAFA" opacity="0.7"/>
          <!-- Blood smear on blade -->
          <path d="M 50 22 Q 65 24 82 24 Q 68 27 50 26 Z" fill="#DC2626" opacity="0.75"/>
          <!-- Guard -->
          <rect x="18" y="10" width="6" height="28" rx="1.5" fill="#52525B"/>
          <!-- Handle -->
          <rect x="0" y="16" width="20" height="16" rx="3" fill="url(#handle)"/>
          <rect x="3" y="19" width="14" height="1.2" fill="#DC2626" opacity="0.85"/>
          <rect x="3" y="28" width="14" height="1.2" fill="#DC2626" opacity="0.85"/>
          <!-- Pommel -->
          <circle cx="2" cy="24" r="3" fill="#DC2626"/>
          <!-- Blood drip from blade tip -->
          <path d="M 96 28 Q 100 34 98 44 Q 95 46 93 44 Q 91 34 94 28 Z" fill="url(#bloodDrip)"/>
          <circle cx="96" cy="52" r="2" fill="#DC2626"/>
        </g>

        <!-- Wordmark: SCREAMFINDER -->
        <text x="116" y="60"
              font-family="Impact, 'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif"
              font-weight="900"
              font-size="48"
              letter-spacing="1.5">
          <tspan fill="#DC2626">SCREAM</tspan><tspan fill="#F5F5F7">FINDER</tspan>
        </text>
        <!-- Blood drops falling below wordmark -->
        <circle cx="178" cy="78" r="3" fill="#DC2626"/>
        <circle cx="260" cy="82" r="2.2" fill="#DC2626"/>
        <circle cx="342" cy="79" r="2.6" fill="#DC2626"/>
        <circle cx="424" cy="84" r="2" fill="#DC2626"/>
      </svg>
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
