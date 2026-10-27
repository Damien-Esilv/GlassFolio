// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code is running as a Supabase Edge Function: https://supabase.com/docs/guides/functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import enLocale from './locales/en.json' with { type: 'json' };
import frLocale from './locales/fr.json' with { type: 'json' };

interface SecurityNotificationRequest {
  action: 'passkey_added' | 'passkey_removed';
  passkeyName: string;
  locale?: string;
}

interface ActionStrings {
  subject: string;
  heading: string;
  body: string;
}

interface LocaleStrings {
  passkey_added: ActionStrings;
  passkey_removed: ActionStrings;
  alertNote: string;
  footerText: string;
}

const LOCALES: Record<string, LocaleStrings> = {
  en: enLocale as LocaleStrings,
  fr: frLocale as LocaleStrings,
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const rateLimitMap = new Map<string, number>();

// CORS is limited to the app origins (comma-separated ALLOWED_ORIGINS secret overrides the default).
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || 'https://app.glassfolio.dev')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const resolveAllowedOrigin = (req: Request): string => {
  const origin = req.headers.get('Origin') || '';
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
        'Vary': 'Origin',
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
    const rawLocale = body.locale || user.user_metadata?.locale || 'en';
    const locale = rawLocale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    const dict = LOCALES[locale] || LOCALES.en;

    const actionStrings = dict[action] || dict.passkey_added;
    const isAdded = action === 'passkey_added';
    const safePasskeyName = escapeHtml(passkeyName || 'Passkey');
    const safeEmail = escapeHtml(user.email || '');

    const subject = actionStrings.subject;
    const heading = actionStrings.heading;
    const bodyText = actionStrings.body
      .replace(/\{\{passkeyName\}\}/g, safePasskeyName)
      .replace(/\{\{email\}\}/g, safeEmail);
    const alertNote = dict.alertNote;
    const footerText = dict.footerText;

    const emailHtml = `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1220;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#111a2e;border:1px solid #223052;border-radius:16px;">
<tr><td align="center" style="padding:32px 32px 8px 32px;">
<img src="https://glassfolio.dev/logo120.png" width="56" height="56" alt="GlassFolio" style="display:block;border:0;">
<p style="margin:12px 0 0 0;font-size:16px;font-weight:700;letter-spacing:0.5px;color:#e6edf7;">GlassFolio</p>
</td></tr>
<tr><td style="padding:16px 32px 8px 32px;">
<h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#ffffff;text-align:center;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#b8c4d9;">${bodyText}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a233a;border-left:4px solid ${isAdded ? '#10b981' : '#f59e0b'};border-radius:8px;padding:12px 16px;margin:20px 0;">
<tr><td>
<p style="margin:0;font-size:13px;line-height:1.5;color:#e6edf7;">${escapeHtml(alertNote)}</p>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 32px 32px 32px;border-top:1px solid #223052;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#7f8ca6;text-align:center;">${escapeHtml(footerText)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    // Dispatch email via Resend API if API key is configured
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('SECURITY_FROM_EMAIL') || 'GlassFolio <noreply@glassfolio.dev>';

    if (resendApiKey && user.email) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [user.email],
            subject,
            html: emailHtml,
          }),
        });
        if (!resendRes.ok) {
          const errText = await resendRes.text();
          console.error(`[security-notify] Resend delivery failed (${resendRes.status}): ${errText}`);
        } else {
          console.log(`[security-notify] Email delivered via Resend for user ${user.id}`);
        }
      } catch (err: unknown) {
        console.error('[security-notify] Resend dispatch error:', err);
      }
    } else {
      console.log(`[security-notify] RESEND_API_KEY not set; skipped remote dispatch for user ${user.id}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        recipient: user.email,
        subject,
        message: heading,
        dispatchedAt: new Date().toISOString(),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
        'Vary': 'Origin',
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
