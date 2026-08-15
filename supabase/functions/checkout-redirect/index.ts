import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'success';
  const deepLink = `onspaceapp://subscription/${status}`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting...</title>
  <style>
    body {
      margin: 0;
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 24px;
    }
    h1 { color: #dc2626; font-size: 24px; margin-bottom: 8px; }
    p { color: #999; font-size: 16px; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      background: #dc2626;
      color: #fff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 16px;
      border: none;
      cursor: pointer;
      margin-bottom: 16px;
    }
    .hint { color: #666; font-size: 14px; margin-top: 8px; }
    .checkmark { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="checkmark">${status === 'success' ? '\u2705' : '\u274C'}</div>
  <h1>${status === 'success' ? 'Payment Successful!' : 'Payment Cancelled'}</h1>
  <p>${status === 'success' ? 'Your Pro subscription is now active.' : 'No charges were made.'}</p>
  <button class="btn" id="closeBtn" onclick="closeWindow()">Return to ScreamFinder</button>
  <p class="hint" id="hint" style="display:none;">If nothing happened, please close this tab/window manually and return to the app. Your subscription status will update automatically.</p>
  <script>
    var attempts = 0;
    function closeWindow() {
      attempts++;
      // Try deep link first
      window.location.href = "${deepLink}";
      // Try closing the window/tab after a short delay
      setTimeout(function() {
        try { window.close(); } catch(e) {}
      }, 500);
      // If still here after 2 seconds, show the hint
      setTimeout(function() {
        document.getElementById('hint').style.display = 'block';
        document.getElementById('closeBtn').textContent = 'Close This Window';
        document.getElementById('closeBtn').onclick = function() {
          try { window.close(); } catch(e) {}
          document.getElementById('hint').style.display = 'block';
        };
      }, 2000);
    }
    // Auto-attempt on load
    setTimeout(closeWindow, 1000);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders,
    },
    status: 200,
  });
});
