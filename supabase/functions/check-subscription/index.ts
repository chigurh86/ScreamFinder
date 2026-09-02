import { corsHeaders } from '../_shared/cors.ts';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${d}`);
};

/**
 * Given the current authenticated Supabase user, find the Stripe customer
 * that is *provably* linked to THIS user via customer.metadata.supabase_user_id.
 *
 * We intentionally do NOT fall back to a naive email match — otherwise a fresh
 * signup that happens to reuse an email from a prior test/live account would
 * inherit that older Stripe customer's active subscription and get Pro for
 * free (this was the bug the user reported: brand-new account, unlimited).
 */
async function findLinkedStripeCustomer(
  stripe: Stripe,
  userId: string,
  email: string,
): Promise<Stripe.Customer | null> {
  // Preferred path: Stripe search API (supports metadata queries directly).
  try {
    const q = `metadata['supabase_user_id']:'${userId}'`;
    const result = await stripe.customers.search({ query: q, limit: 1 });
    if (result.data.length > 0) return result.data[0];
  } catch (e) {
    logStep('Stripe search API failed, falling back to email-list scan', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  // Fallback: list up to 100 customers with this email and pick the one whose
  // metadata links to this Supabase user. Same-email customers without a
  // matching metadata tag are treated as belonging to *someone else* and
  // ignored, which is exactly what prevents subscription inheritance.
  const customers = await stripe.customers.list({ email, limit: 100 });
  for (const c of customers.data) {
    if (c.metadata?.supabase_user_id === userId) return c;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ---- Startup Beacon short-circuit ----
  // The React Native client fires a lightweight POST to this endpoint
  // immediately after JS mounts (see services/startupBeacon.ts). The
  // request carries the `x-startup-beacon: 1` header and a small JSON
  // payload describing the device, OS version, and boot phase. We
  // detect it FIRST — before any auth, Stripe, or DB work — log the
  // payload for durable server-side evidence that JS ran on the
  // device, and return a fast 200. This proves whether a crashed
  // review device (e.g. Apple's iPadOS 26.6 iPad Air M4) ever got
  // past JS bootstrap, so we can distinguish JS bugs from pre-JS
  // native-module init failures.
  if (req.method === 'POST' && req.headers.get('x-startup-beacon') === '1') {
    let payload: any = null;
    try {
      payload = await req.json();
    } catch {
      payload = null;
    }
    logStep('STARTUP_BEACON', {
      phase: req.headers.get('x-beacon-phase') || payload?.phase || 'unknown',
      buildNumber: payload?.buildNumber || null,
      appVersion: payload?.appVersion || null,
      device: payload?.device || null,
      extra: payload?.extra || null,
      userAgent: req.headers.get('user-agent') || null,
      forwardedFor: req.headers.get('x-forwarded-for') || null,
      receivedAt: new Date().toISOString(),
    });
    return new Response(
      JSON.stringify({ beacon: 'ack', phase: payload?.phase ?? null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }

  try {
    logStep('Function started');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not set');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization header not provided');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error('User not authenticated or email unavailable');
    logStep('User authenticated', { userId: user.id, email: user.email });

    // --- Check Apple IAP subscription first ---
    const { data: appleSub } = await supabaseClient
      .from('apple_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('expires_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appleSub) {
      // Only treat as active when we have an explicit expires_date in the
      // future. A NULL expires_date used to be treated as "still active"
      // which meant any junk / partially-inserted row would grant Pro
      // access indefinitely. We now require a concrete future expiry.
      const expiresDate = appleSub.expires_date ? new Date(appleSub.expires_date) : null;
      const isStillActive = expiresDate ? expiresDate > new Date() : false;

      if (isStillActive) {
        logStep('Active Apple IAP subscription found', {
          productId: appleSub.product_id,
          expiresDate: appleSub.expires_date,
        });
        return new Response(
          JSON.stringify({
            subscribed: true,
            product_id: appleSub.product_id,
            subscription_end: appleSub.expires_date,
            source: 'apple',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } else {
        // Mark expired / malformed Apple sub as inactive so it stops
        // showing up in future queries.
        await supabaseClient
          .from('apple_subscriptions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', appleSub.id);
        logStep('Apple subscription expired or missing expires_date; marked inactive');
      }
    }

    // --- Check Stripe subscription (metadata-linked only) ---
    const stripe = new Stripe(stripeKey);
    const linkedCustomer = await findLinkedStripeCustomer(stripe, user.id, user.email);

    if (!linkedCustomer) {
      logStep('No Stripe customer linked to this Supabase user');
      return new Response(
        JSON.stringify({ subscribed: false, product_id: null, subscription_end: null, source: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    logStep('Linked Stripe customer found', { customerId: linkedCustomer.id });

    const subscriptions = await stripe.subscriptions.list({
      customer: linkedCustomer.id,
      status: 'active',
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let productId: string | null = null;
    let subscriptionEnd: string | null = null;

    if (hasActiveSub) {
      const sub = subscriptions.data[0];
      if (sub.current_period_end && typeof sub.current_period_end === 'number') {
        subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      }
      productId = sub.items?.data?.[0]?.price?.product as string ?? null;
      logStep('Active subscription found', { subscriptionId: sub.id, endDate: subscriptionEnd, productId });
    } else {
      logStep('No active subscription for linked customer');
    }

    return new Response(
      JSON.stringify({
        subscribed: hasActiveSub,
        product_id: productId,
        subscription_end: subscriptionEnd,
        source: hasActiveSub ? 'stripe' : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep('Error', { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
