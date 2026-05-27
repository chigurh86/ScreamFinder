import { corsHeaders } from '../_shared/cors.ts';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${d}`);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not set');
    logStep('Stripe key verified');

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
      const expiresDate = appleSub.expires_date ? new Date(appleSub.expires_date) : null;
      const isStillActive = !expiresDate || expiresDate > new Date();

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
        // Mark expired Apple sub as inactive
        await supabaseClient
          .from('apple_subscriptions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', appleSub.id);
        logStep('Apple subscription expired, marked inactive');
      }
    }

    // --- Check Stripe subscription ---
    const stripe = new Stripe(stripeKey);
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      logStep('No Stripe customer found');
      return new Response(
        JSON.stringify({ subscribed: false, product_id: null, subscription_end: null, source: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const customerId = customers.data[0].id;
    logStep('Stripe customer found', { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    let productId: string | null = null;
    let subscriptionEnd: string | null = null;

    if (hasActiveSub) {
      const sub = subscriptions.data[0];
      logStep('Raw subscription data', {
        subscriptionId: sub.id,
        current_period_end: sub.current_period_end,
        status: sub.status,
      });

      if (sub.current_period_end && typeof sub.current_period_end === 'number') {
        subscriptionEnd = new Date(sub.current_period_end * 1000).toISOString();
      }
      productId = sub.items?.data?.[0]?.price?.product as string ?? null;
      logStep('Active subscription found', { subscriptionId: sub.id, endDate: subscriptionEnd, productId });
    } else {
      logStep('No active subscription');
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
