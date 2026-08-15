import { corsHeaders } from '../_shared/cors.ts';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Use — ScreamFinder by Freaky Attractions</title>
  <style>
    :root {
      --red: #b50000;
      --red-light: #dc2626;
      --bg: #000;
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

    /* Hero */
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

    /* Content */
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
      <h1 class="hero-title">TERMS OF <span class="highlight">USE</span></h1>
      <p class="hero-subtitle">
        The rules and conditions governing your use of ScreamFinder by Freaky Attractions.
      </p>
    </div>
  </header>

  <div class="connector-line"></div>

  <main class="policy-content">
    <div class="wrap">
      <p class="last-updated">Last Updated: May 14, 2026</p>

      <section class="policy-section">
        <h2>Acceptance of Terms</h2>
        <p>By downloading, installing, or using ScreamFinder (&ldquo;the App&rdquo;), you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the App. ScreamFinder is operated by Freaky Attractions (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;).</p>
      </section>

      <section class="policy-section">
        <h2>Eligibility</h2>
        <p>You must be at least <strong>17 years of age</strong> to use ScreamFinder. The App contains references to horror content including violence, gore, and mature themes. By using the App, you confirm that you meet this age requirement.</p>
      </section>

      <section class="policy-section">
        <h2>Account Registration</h2>
        <p>To access certain features, you must create an account using a valid email address. You are responsible for:</p>
        <ul>
          <li>Maintaining the confidentiality of your login credentials</li>
          <li>All activities that occur under your account</li>
          <li>Notifying us immediately of any unauthorized use</li>
        </ul>
        <p>We reserve the right to suspend or terminate accounts that violate these Terms.</p>
      </section>

      <section class="policy-section">
        <h2>Description of Service</h2>
        <p>ScreamFinder provides AI-powered horror movie recommendations and streaming availability information. The App uses artificial intelligence to suggest films based on your input and displays verified streaming provider data sourced from TMDB (The Movie Database).</p>
        <p><strong>Disclaimer:</strong> Streaming availability is subject to change without notice and may vary by region. We do not guarantee the accuracy or completeness of streaming information at any given time.</p>
      </section>

      <section class="policy-section">
        <h2>Free Tier &amp; Usage Limits</h2>
        <p>ScreamFinder offers a free tier with the following limitations:</p>
        <ul>
          <li><strong>3 searches per day</strong> &mdash; resets daily at midnight UTC</li>
          <li><strong>10 saved favorites</strong> &mdash; maximum capacity for free accounts</li>
        </ul>
        <p>These limits may be adjusted at our discretion. Attempts to circumvent usage limits through multiple accounts or automated means are prohibited.</p>
      </section>

      <section class="policy-section">
        <h2>ScreamFinder Pro Subscription</h2>
        <p><strong>Pricing:</strong> ScreamFinder Pro is available as an annual subscription at <strong>$29.99/year</strong> (or equivalent local currency). Pricing may vary by region and platform.</p>
        <p><strong>Benefits:</strong> Pro subscribers receive unlimited daily searches and unlimited saved favorites.</p>
        <p><strong>Apple App Store (iOS):</strong> Subscriptions are billed through your Apple ID account. Payment is charged at confirmation of purchase. The subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel subscriptions in your Apple ID Account Settings.</p>
        <p><strong>Stripe (Android/Web):</strong> Subscriptions are billed through Stripe. You can manage your subscription and cancel at any time through the Customer Portal accessible from your Profile page.</p>
        <p><strong>No Refunds:</strong> All subscription payments are non-refundable except as required by applicable law or platform policies (Apple App Store, Google Play). To request a refund for an Apple purchase, contact Apple Support directly.</p>
      </section>

      <section class="policy-section">
        <h2>Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the App for any unlawful purpose or in violation of any applicable laws</li>
          <li>Attempt to reverse-engineer, decompile, or disassemble the App</li>
          <li>Scrape, crawl, or use automated tools to extract data from the App</li>
          <li>Interfere with or disrupt the App&rsquo;s infrastructure or other users&rsquo; experience</li>
          <li>Create multiple accounts to bypass free-tier limits</li>
          <li>Upload malicious, offensive, or inappropriate content as profile images</li>
          <li>Impersonate any person or entity or misrepresent your affiliation</li>
        </ul>
      </section>

      <section class="policy-section">
        <h2>Intellectual Property</h2>
        <p>All content, design, branding, and code within ScreamFinder are the property of Freaky Attractions and are protected by copyright and trademark laws. Movie posters, titles, and metadata are sourced from TMDB under their API terms of use and remain the property of their respective owners.</p>
        <p>You may not reproduce, distribute, or create derivative works from the App or its content without our express written permission.</p>
      </section>

      <section class="policy-section">
        <h2>AI-Generated Content</h2>
        <p>Recommendations provided by ScreamFinder are generated by artificial intelligence and are for entertainment purposes only. We do not guarantee the accuracy, relevance, or quality of AI-generated suggestions. Match percentages are algorithmic estimates and do not represent objective measures of film similarity.</p>
      </section>

      <section class="policy-section">
        <h2>Third-Party Services</h2>
        <p>ScreamFinder integrates with third-party services including TMDB, Supabase, OnSpace AI, Apple, and Stripe. Your use of these services is subject to their respective terms and privacy policies. We are not responsible for the availability, accuracy, or practices of third-party services.</p>
      </section>

      <section class="policy-section">
        <h2>Disclaimer of Warranties</h2>
        <p>ScreamFinder is provided <strong>&ldquo;as is&rdquo;</strong> and <strong>&ldquo;as available&rdquo;</strong> without warranties of any kind, express or implied. We do not warrant that the App will be uninterrupted, error-free, or free of harmful components. Your use of the App is at your sole risk.</p>
      </section>

      <section class="policy-section">
        <h2>Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, Freaky Attractions shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of ScreamFinder, including but not limited to loss of data, loss of profits, or service interruptions.</p>
        <p>Our total aggregate liability shall not exceed the amount you paid for the App in the 12 months preceding the claim.</p>
      </section>

      <section class="policy-section">
        <h2>Indemnification</h2>
        <p>You agree to indemnify and hold harmless Freaky Attractions, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your use of the App or violation of these Terms.</p>
      </section>

      <section class="policy-section">
        <h2>Termination</h2>
        <p>We may suspend or terminate your access to ScreamFinder at any time, with or without cause, and with or without notice. Upon termination, your right to use the App ceases immediately. Provisions that by their nature should survive termination (including intellectual property, limitation of liability, and indemnification) shall survive.</p>
      </section>

      <section class="policy-section">
        <h2>Governing Law</h2>
        <p>These Terms shall be governed by and construed in accordance with the laws of the United States. Any disputes arising from these Terms or the use of ScreamFinder shall be resolved in the courts of competent jurisdiction.</p>
      </section>

      <section class="policy-section">
        <h2>Changes to These Terms</h2>
        <p>We reserve the right to modify these Terms at any time. We will notify you of material changes through the App or via email. Continued use of ScreamFinder after changes constitutes acceptance of the updated Terms. It is your responsibility to review these Terms periodically.</p>
      </section>

      <section class="policy-section">
        <h2>Contact Us</h2>
        <p>If you have questions about these Terms of Use, please contact us at:</p>
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
