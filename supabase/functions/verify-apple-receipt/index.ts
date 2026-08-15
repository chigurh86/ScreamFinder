import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VERIFY-APPLE-RECEIPT] ${step}${d}`);
};

// Apple verification endpoints
const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleReceiptResponse {
  status: number;
  environment?: string;
  latest_receipt_info?: Array<{
    product_id: string;
    transaction_id: string;
    original_transaction_id: string;
    purchase_date_ms: string;
    expires_date_ms?: string;
    is_trial_period?: string;
    in_app_ownership_type?: string;
  }>;
  pending_renewal_info?: Array<{
    auto_renew_status: string;
    product_id: string;
  }>;
}

async function verifyWithApple(receiptData: string, useSandbox = false): Promise<AppleReceiptResponse> {
  const url = useSandbox ? APPLE_SANDBOX_URL : APPLE_PRODUCTION_URL;
  const appSharedSecret = Deno.env.get('APPLE_SHARED_SECRET') || '';

  const body: any = { 'receipt-data': receiptData };
  if (appSharedSecret) {
    body.password = appSharedSecret;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization header not provided');

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error('User not authenticated');
    logStep('User authenticated', { userId: user.id });

    // Parse request body
    const { receiptData, productId, transactionId } = await req.json();
    if (!receiptData) throw new Error('Receipt data is required');
    logStep('Receipt data received', { productId, transactionId });

    // Verify with Apple - try production first
    let appleResponse = await verifyWithApple(receiptData, false);
    logStep('Apple production response', { status: appleResponse.status });

    // Status 21007 means it was a sandbox receipt, retry with sandbox
    if (appleResponse.status === 21007) {
      logStep('Retrying with sandbox endpoint');
      appleResponse = await verifyWithApple(receiptData, true);
      logStep('Apple sandbox response', { status: appleResponse.status });
    }

    // Status 0 = valid receipt
    if (appleResponse.status !== 0) {
      logStep('Invalid receipt', { status: appleResponse.status });
      return new Response(
        JSON.stringify({ error: `Invalid receipt (status: ${appleResponse.status})`, verified: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const environment = appleResponse.environment || 'Production';
    const latestReceipts = appleResponse.latest_receipt_info || [];
    logStep('Receipt valid', { environment, receiptCount: latestReceipts.length });

    // Find the most recent subscription receipt for our product
    const relevantReceipts = latestReceipts
      .filter(r => r.product_id === productId || !productId)
      .sort((a, b) => parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms));

    if (relevantReceipts.length === 0) {
      logStep('No matching subscription found in receipt');
      return new Response(
        JSON.stringify({ error: 'No matching subscription found', verified: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const latestReceipt = relevantReceipts[0];
    const purchaseDate = new Date(parseInt(latestReceipt.purchase_date_ms));
    const expiresDate = latestReceipt.expires_date_ms
      ? new Date(parseInt(latestReceipt.expires_date_ms))
      : null;
    const isActive = expiresDate ? expiresDate > new Date() : true;

    logStep('Subscription details', {
      productId: latestReceipt.product_id,
      transactionId: latestReceipt.transaction_id,
      originalTransactionId: latestReceipt.original_transaction_id,
      purchaseDate: purchaseDate.toISOString(),
      expiresDate: expiresDate?.toISOString(),
      isActive,
    });

    // Upsert subscription record in database
    const { error: upsertError } = await supabaseClient
      .from('apple_subscriptions')
      .upsert({
        user_id: user.id,
        product_id: latestReceipt.product_id,
        transaction_id: latestReceipt.transaction_id,
        original_transaction_id: latestReceipt.original_transaction_id,
        purchase_date: purchaseDate.toISOString(),
        expires_date: expiresDate?.toISOString() || null,
        is_active: isActive,
        receipt_data: receiptData.substring(0, 500), // Store truncated for reference
        environment: environment.toLowerCase(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'original_transaction_id',
      });

    if (upsertError) {
      logStep('DB upsert error', { error: upsertError.message });
      // Don't fail the request - receipt is still valid
    } else {
      logStep('Subscription record saved to DB');
    }

    return new Response(
      JSON.stringify({
        verified: true,
        subscribed: isActive,
        product_id: latestReceipt.product_id,
        subscription_end: expiresDate?.toISOString() || null,
        environment,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep('Error', { message: msg });
    return new Response(
      JSON.stringify({ error: msg, verified: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
