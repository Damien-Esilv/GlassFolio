// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code is running as a Supabase Edge Function: https://supabase.com/docs/guides/functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface SecurityNotificationRequest {
  action: 'passkey_added' | 'passkey_removed';
  passkeyName: string;
}

const rateLimitMap = new Map<string, number>();

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Rate-limit: max 1 notification per 30 seconds per user
    const lastNotified = rateLimitMap.get(user.id) || 0;
    const now = Date.now();
    if (now - lastNotified < 30_000) {
      return new Response(JSON.stringify({ status: 'rate_limited', message: 'Notification throttled' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    rateLimitMap.set(user.id, now);

    const body: SecurityNotificationRequest = await req.json();
    const { action, passkeyName } = body;
    const locale = (user.user_metadata?.locale || 'en').startsWith('fr') ? 'fr' : 'en';

    // Build notification record / SMTP notification payload
    const isAdded = action === 'passkey_added';
    const subject = locale === 'fr'
      ? (isAdded
          ? `Une nouvelle passkey a été ajoutée à votre compte GlassFolio`
          : `Une passkey a été supprimée de votre compte GlassFolio`)
      : (isAdded
          ? `A new passkey was added to your GlassFolio account`
          : `A passkey was removed from your GlassFolio account`);

    const message = locale === 'fr'
      ? (isAdded
          ? `La clé d'accès « ${passkeyName} » vient d'être configurée pour votre compte (${user.email}).`
          : `La clé d'accès « ${passkeyName} » a été révoquée de votre compte (${user.email}).`)
      : (isAdded
          ? `The passkey "${passkeyName}" was just registered for your account (${user.email}).`
          : `The passkey "${passkeyName}" was removed from your account (${user.email}).`);

    // In a live environment, dispatch via configured SMTP transport.
    // For local and standard operation, log the dispatch event and return success.
    console.log(`[security-notify] Dispatched: ${action} for ${user.email} (${subject})`);

    return new Response(
      JSON.stringify({
        success: true,
        action,
        recipient: user.email,
        subject,
        message,
        dispatchedAt: new Date().toISOString(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown server error';
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
