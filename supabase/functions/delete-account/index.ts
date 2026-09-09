import { corsHeaders } from '../_shared/cors.ts';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DELETE-ACCOUNT] ${step}${d}`);
};

/**
 * Permanently deletes the authenticated user's account and every piece
 * of associated data. Required by Apple App Store Review Guideline
 * 5.1.1(v): any app that supports account creation must also offer an
 * in-app account deletion flow.
 *
 * Deletion chain (all cascading FKs):
 *   auth.users
 *     └── public.user_profiles        (id references auth.users.id)
 *           ├── public.apple_subscriptions  (user_id references user_profiles.id)
 *           └── public.search_usage         (user_id references user_profiles.id)
 *
 * Best-effort side effects (never block deletion):
 *   1. Cancel any active Stripe subscription linked via metadata.
 *   2. Remove the user's avatar files from the `avatars` storage bucket.
 *
 * We do NOT proactively cancel Apple IAP subscriptions from the server —
 * Apple only allows the user to manage those in Settings > Apple ID >
 * Subscriptions, and the client-side confirmation copy tells the user
 * exactly that.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  try {
    logStep('Function started');

    // Service-role admin client (bypasses RLS so we can delete cleanly).
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Verify caller via JWT — never trust a client-provided user id.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization header not provided');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error('User not authenticated');

    logStep('User authenticated', { userId: user.id, email: user.email });

    // -------- Best-effort: cancel any active Stripe subscription --------
    try {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (stripeKey && user.email) {
        const stripe = new Stripe(stripeKey);

        // Prefer metadata search so we never touch someone else's Stripe
        // customer even if it happens to share an email address.
        let customerId: string | null = null;
        try {
          const q = `metadata['supabase_user_id']:'${user.id}'`;
          const searchResult = await stripe.customers.search({
            query: q,
            limit: 1,
          });
          if (searchResult.data.length > 0) {
            customerId = searchResult.data[0].id;
          }
        } catch (e) {
          logStep('Stripe search failed, falling back to email list', {
            err: e instanceof Error ? e.message : String(e),
          });
        }

        if (!customerId) {
          const customers = await stripe.customers.list({
            email: user.email,
            limit: 100,
          });
          for (const c of customers.data) {
            if (c.metadata?.supabase_user_id === user.id) {
              customerId = c.id;
              break;
            }
          }
        }

        if (customerId) {
          const subs = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            limit: 10,
          });
          for (const sub of subs.data) {
            try {
              await stripe.subscriptions.cancel(sub.id);
              logStep('Stripe subscription canceled', {
                subscriptionId: sub.id,
              });
            } catch (e) {
              logStep('Stripe cancel failed (non-fatal)', {
                subscriptionId: sub.id,
                err: e instanceof Error ? e.message : String(e),
              });
            }
          }
        } else {
          logStep('No Stripe customer linked to this user');
        }
      }
    } catch (e) {
      logStep('Stripe cleanup threw (non-fatal)', {
        err: e instanceof Error ? e.message : String(e),
      });
    }

    // -------- Best-effort: delete avatar files from Storage --------
    try {
      const { data: files } = await supabaseAdmin.storage
        .from('avatars')
        .list(user.id);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        const { error: storageError } = await supabaseAdmin.storage
          .from('avatars')
          .remove(paths);
        if (storageError) {
          logStep('Storage cleanup returned error (non-fatal)', {
            err: storageError.message,
          });
        } else {
          logStep('Avatar files deleted', { count: paths.length });
        }
      }
    } catch (e) {
      logStep('Storage cleanup threw (non-fatal)', {
        err: e instanceof Error ? e.message : String(e),
      });
    }

    // -------- Final step: delete the auth.users row --------
    // ON DELETE CASCADE removes user_profiles, apple_subscriptions,
    // and search_usage automatically.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user.id,
    );
    if (deleteError) {
      throw new Error(`Failed to delete user: ${deleteError.message}`);
    }

    logStep('User deleted successfully', { userId: user.id });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Account and all associated data deleted',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
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
