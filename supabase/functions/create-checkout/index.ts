import { corsHeaders } from '../_shared/cors.ts';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${d}`);
};

const PRICE_ID = 'price_1TWNslLQkBuZbtvTJ8pql38k';

/**
 * Find the Stripe customer that is *provably* linked to THIS Supabase user
 * via customer.metadata.supabase_user_id. Same logic as check-subscription —
 * see the comment there for why we intentionally do not fall back to email.
 */
async function findLinkedStripeCustomer(
  stripe: Stripe,
  userId: string,
  email: string,
): Promise<Stripe.Customer | null> {
  try {
    const q = `metadata['supabase_user_id']:'${userId}'`;
    const result = await stripe.customers.search({ query: q, limit: 1 });
    if (result.data.length > 0) return result.data[0];
  } catch (e) {
    logStep('Stripe search API failed, falling back to email-list scan', {
      err: e instanceof Error ? e.message : String(e),
    });
  }

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

    const stripe = new Stripe(stripeKey);

    // Only consider Stripe customers that are metadata-linked to THIS
    // Supabase user. Anyone else's customer at the same email address is
    // treated as unrelated (this prevents subscription inheritance across
    // Supabase users who happen to share an email).
    let linkedCustomer = await findLinkedStripeCustomer(stripe, user.id, user.email);

    if (linkedCustomer) {
      logStep('Existing linked Stripe customer found', { customerId: linkedCustomer.id });

      const subs = await stripe.subscriptions.list({
        customer: linkedCustomer.id,
        status: 'active',
        limit: 1,
      });
      if (subs.data.length > 0) {
        logStep('User already has active subscription');
        return new Response(
          JSON.stringify({ error: 'You already have an active subscription.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    } else {
      // No metadata-linked customer exists yet. Create a fresh Stripe
      // customer specifically for THIS Supabase user, with the linking
      // metadata attached up front so every subsequent lookup (from
      // check-subscription, from customer-portal, etc.) resolves cleanly
      // and never accidentally shares with another Supabase user at the
      // same email.
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      linkedCustomer = newCustomer;
      logStep('Created new linked Stripe customer', { customerId: newCustomer.id });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const redirectBase = `${supabaseUrl}/functions/v1/checkout-redirect`;

    const session = await stripe.checkout.sessions.create({
      customer: linkedCustomer.id,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      // Tag the resulting subscription with the Supabase user id so any
      // future webhook can correlate directly to our auth.users row.
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id },
      success_url: `${redirectBase}?status=success`,
      cancel_url: `${redirectBase}?status=cancel`,
    });

    logStep('Checkout session created', { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep('Error', { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
