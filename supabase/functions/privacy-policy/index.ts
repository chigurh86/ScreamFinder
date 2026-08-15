import { corsHeaders } from '../_shared/cors.ts';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — ScreamFinder by Freaky Attractions</title>
  <style>
    :root {
      --red: #b50000;
      --red-light: #dc2626;
      --bg: #000;
      --bg-section: #0a0a0a;
      --text: #ccc;
      --text-muted: #888;
      --text-heading: #ededed;
      --border: #1a1a1a;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.8;
      -webkit-font-smoothing: antialiased;
    }

    a { color: var(--red-light); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .wrap {
      max-width: 750px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Hero Header */
    .hero {
      padding: 140px 0 80px;
      background: radial-gradient(circle at center, #1a0000 0%, #000 70%);
      text-align: center;
    }

    .section-label {
      color: var(--red);
      text-transform: uppercase;
      letter-spacing: 4px;
      font-size: 0.8rem;
      font-weight: bold;
      margin-bottom: 15px;
      display: block;
    }

    .hero-title {
      font-size: 3.5rem;
      line-height: 1;
      margin-bottom: 20px;
      text-transform: uppercase;
      font-weight: 900;
      color: var(--text-heading);
    }

    .hero-title .highlight {
      color: var(--red-light);
    }

    .hero-subtitle {
      font-size: 1.1rem;
      color: var(--text-muted);
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
    }

    /* Connector */
    .connector-line {
      width: 2px;
      height: 60px;
      background: linear-gradient(to bottom, var(--red), transparent);
      margin: 0 auto;
    }

    /* Content Sections */
    .policy-content {
      padding: 80px 0 120px;
    }

    .last-updated {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 40px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .policy-section {
      margin-bottom: 48px;
    }

    .policy-section h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text-heading);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .policy-section p {
      color: var(--text);
      font-size: 1rem;
      line-height: 1.8;
      margin-bottom: 14px;
    }

    .policy-section strong {
      color: var(--text-heading);
      font-weight: 700;
    }

    .policy-section ul {
      list-style: none;
      padding: 0;
      margin: 12px 0;
    }

    .policy-section ul li {
      position: relative;
      padding-left: 24px;
      margin-bottom: 10px;
      color: var(--text);
      font-size: 1rem;
      line-height: 1.6;
    }

    .policy-section ul li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 10px;
      width: 8px;
      height: 8px;
      background: var(--red);
      border-radius: 50%;
    }

    /* Footer */
    .policy-footer {
      text-align: center;
      padding: 40px 0 60px;
      border-top: 1px solid var(--border);
    }

    .policy-footer p {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .policy-footer a {
      color: var(--red-light);
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-size: 0.85rem;
    }

    .back-link {
      display: inline-block;
      margin-top: 20px;
      color: var(--red-light);
      font-weight: bold;
      letter-spacing: 2px;
      text-transform: uppercase;
      font-size: 0.85rem;
      text-decoration: none;
    }

    .back-link:hover { text-decoration: underline; }

    /* Responsive */
    @media (max-width: 768px) {
      .hero { padding: 100px 0 50px; }
      .hero-title { font-size: 2.2rem; }
      .policy-content { padding: 50px 0 80px; }
      .policy-section h2 { font-size: 1.2rem; }
    }
  </style>
</head>
<body>

  <header class="hero">
    <div class="wrap">
      <span class="section-label">Legal</span>
      <h1 class="hero-title">PRIVACY <span class="highlight">POLICY</span></h1>
      <p class="hero-subtitle">
        How ScreamFinder by Freaky Attractions collects, uses, and protects your information.
      </p>
    </div>
  </header>

  <div class="connector-line"></div>

  <main class="policy-content">
    <div class="wrap">
      <p class="last-updated">Last Updated: May 12, 2026</p>

      <section class="policy-section">
        <h2>Introduction</h2>
        <p>ScreamFinder (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use the ScreamFinder mobile application, a product of Freaky Attractions.</p>
      </section>

      <section class="policy-section">
        <h2>Information We Collect</h2>
        <p><strong>Account Information:</strong> When you create an account, we collect your email address and password. We do not collect your real name unless you choose to provide it.</p>
        <p><strong>Usage Data:</strong> We track search queries and search frequency to enforce free-tier limits and improve recommendation quality. Search history is stored locally on your device and is not shared with third parties.</p>
        <p><strong>Saved Preferences:</strong> Movies you save to your favorites are stored locally on your device.</p>
        <p><strong>Profile Photos:</strong> If you upload a profile photo, it is stored securely in our cloud storage and associated with your account.</p>
        <p><strong>Subscription Data:</strong> If you subscribe to ScreamFinder Pro, we store subscription status information. Payment processing is handled entirely by Apple (for iOS) or Stripe (for Android/Web). We do not store or have access to your full payment details.</p>
      </section>

      <section class="policy-section">
        <h2>How We Use Your Information</h2>
        <ul>
          <li>To provide personalized horror movie recommendations using AI</li>
          <li>To manage your account and subscription status</li>
          <li>To enforce usage limits on the free tier</li>
          <li>To improve our recommendation algorithm and service quality</li>
          <li>To display movie posters and streaming availability via TMDB</li>
        </ul>
      </section>

      <section class="policy-section">
        <h2>Third-Party Services</h2>
        <p><strong>Supabase:</strong> We use Supabase for authentication, database operations, and file storage. Your account data is stored securely on Supabase infrastructure.</p>
        <p><strong>TMDB (The Movie Database):</strong> We use the TMDB API to retrieve movie posters, details, and streaming availability. No personal data is shared with TMDB.</p>
        <p><strong>OnSpace AI:</strong> We use AI services to generate movie recommendations. Your search queries are sent to the AI service but are not permanently stored or used for training.</p>
        <p><strong>Apple App Store:</strong> On iOS, subscription payments are processed by Apple. Apple&rsquo;s privacy policy governs how they handle your payment information.</p>
        <p><strong>Stripe:</strong> On Android and Web, subscription payments are processed by Stripe. Stripe&rsquo;s privacy policy governs how they handle your payment information.</p>
      </section>

      <section class="policy-section">
        <h2>Data Retention</h2>
        <p>Your account data is retained for as long as your account is active. Search usage data is retained on a daily basis for limit enforcement. You can request deletion of your account and all associated data by contacting us.</p>
      </section>

      <section class="policy-section">
        <h2>Your Rights</h2>
        <ul>
          <li>Access your personal data stored in our systems</li>
          <li>Request correction of inaccurate information</li>
          <li>Request deletion of your account and associated data</li>
          <li>Export your saved movies and preferences</li>
          <li>Opt out of non-essential data collection</li>
        </ul>
      </section>

      <section class="policy-section">
        <h2>Data Security</h2>
        <p>We implement industry-standard security measures including encrypted data transmission (TLS/SSL), secure authentication tokens, and row-level security policies on our database. However, no method of electronic transmission or storage is 100% secure.</p>
      </section>

      <section class="policy-section">
        <h2>Children&rsquo;s Privacy</h2>
        <p>ScreamFinder is not intended for children under 17 due to horror content. We do not knowingly collect personal information from children under 17. If you believe a child has provided us with personal information, please contact us immediately.</p>
      </section>

      <section class="policy-section">
        <h2>Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email. Continued use of ScreamFinder after changes constitutes acceptance of the updated policy.</p>
      </section>

      <section class="policy-section">
        <h2>Contact Us</h2>
        <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at:</p>
        <p><a href="mailto:support@screamfinder.app">support@screamfinder.app</a></p>
      </section>
    </div>
  </main>

  <footer class="policy-footer">
    <div class="wrap">
      <p>&copy; 2026 Freaky Attractions. All rights reserved.</p>
      <a href="https://freakyattractions.com" class="back-link">freakyattractions.com &rarr;</a>
    </div>
  </footer>

</body>
</html>`;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});
