/**
 * scripts/lib/emailTemplates.mjs (Epic E25 — TGLA-084)
 *
 * Builds the Supabase Auth email templates + subjects from:
 *   - supabase/templates/layout.html        (shared, table-based, inline CSS)
 *   - supabase/templates/i18n/<lang>.json   (one file per language)
 *
 * Every `i18n/<lang>.json` file found is compiled into a branch of a Go-template
 * conditional on `.Data.locale`, so adding a language only requires adding a JSON
 * file — no template editing. The default language (`en`) is the `else` branch.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_LOCALE = 'en';

/**
 * Event catalogue. `kind` drives the Management API field naming.
 *  - link:   Go-template expression used as the CTA target (optional)
 *  - code:   shows `{{ .Token }}` in a prominent block
 *  - notice: which footer notice is appended
 */
export const EMAIL_EVENTS = {
    confirmation: {
        kind: 'auth',
        code: true,
        link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup',
        notice: 'ignoreNotice',
    },
    recovery: {
        kind: 'auth',
        code: false,
        link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery',
        notice: 'ignoreNotice',
    },
    email_change: {
        kind: 'auth',
        code: false,
        link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change',
        notice: 'ignoreNotice',
    },
    magic_link: {
        kind: 'auth',
        code: true,
        link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink',
        notice: 'ignoreNotice',
    },
    invite: {
        kind: 'auth',
        code: false,
        link: '{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite',
        notice: 'ignoreNotice',
    },
    reauthentication: { kind: 'auth', code: true, link: null, notice: 'ignoreNotice' },
    password_changed: { kind: 'notification', code: false, link: null, notice: 'securityNotice' },
    email_changed: { kind: 'notification', code: false, link: null, notice: 'securityNotice' },
    identity_linked: { kind: 'notification', code: false, link: null, notice: 'securityNotice' },
    identity_unlinked: { kind: 'notification', code: false, link: null, notice: 'securityNotice' },
    mfa_factor_enrolled: { kind: 'notification', code: false, link: null, notice: 'securityNotice' },
    mfa_factor_unenrolled: { kind: 'notification', code: false, link: null, notice: 'securityNotice' },
};

const escapeHtml = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Loads every `<lang>.json` in the i18n directory. */
export function loadLocales(templatesDir) {
    const dir = join(templatesDir, 'i18n');
    const locales = {};
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
        locales[file.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    }
    if (!locales[DEFAULT_LOCALE]) {
        throw new Error(`Default locale "${DEFAULT_LOCALE}" is missing in ${dir}`);
    }
    return locales;
}

/** Fails fast when a language misses an event or a layout key defined by the default one. */
export function assertLocalesComplete(locales) {
    const reference = locales[DEFAULT_LOCALE];
    const problems = [];
    for (const [lang, bundle] of Object.entries(locales)) {
        for (const key of Object.keys(reference.layout)) {
            if (!bundle.layout?.[key]) problems.push(`${lang}: layout.${key}`);
        }
        for (const [event, fields] of Object.entries(reference.events)) {
            for (const key of Object.keys(fields)) {
                if (!bundle.events?.[event]?.[key]) problems.push(`${lang}: events.${event}.${key}`);
            }
        }
    }
    if (problems.length > 0) {
        throw new Error(`Incomplete email locales:\n  - ${problems.join('\n  - ')}`);
    }
}

function renderCodeBlock(label) {
    return (
        `<p style="margin:0 0 8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#7f8ca6;text-align:center;">${escapeHtml(label)}</p>` +
        '<p style="margin:0 0 24px 0;padding:16px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:\'SFMono-Regular\',Menlo,Consolas,monospace;color:#ffffff;background-color:#0b1220;border:1px solid #223052;border-radius:12px;text-align:center;">{{ .Token }}</p>'
    );
}

function renderCta(label, link, fallbackLabel) {
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;"><tr><td align="center">' +
        `<a href="${link}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;background-color:#3b82f6;border-radius:10px;text-decoration:none;">${escapeHtml(label)}</a>` +
        '</td></tr></table>' +
        `<p style="margin:0 0 20px 0;font-size:12px;line-height:1.5;color:#7f8ca6;word-break:break-all;">${escapeHtml(fallbackLabel)}<br><a href="${link}" style="color:#7fb2ff;">${link}</a></p>`
    );
}

function renderNote(text) {
    return `<p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#9aa8c2;">${escapeHtml(text)}</p>`;
}

/** Renders the full HTML document for one event in one language. */
export function renderHtml(layout, locales, lang, event) {
    const bundle = locales[lang];
    const spec = EMAIL_EVENTS[event];
    const copy = bundle.events[event];
    const values = {
        lang,
        brand: escapeHtml(bundle.layout.brand),
        heading: escapeHtml(copy.heading),
        body: escapeHtml(copy.body),
        footer: escapeHtml(bundle.layout.footer),
        codeBlock: spec.code ? renderCodeBlock(copy.codeLabel) : '',
        ctaBlock: spec.link ? renderCta(copy.cta, spec.link, bundle.layout.linkFallback) : '',
        noteBlock: renderNote(bundle.layout[spec.notice]),
    };
    return layout.replace(/\[\[(\w+)\]\]/g, (_, key) => {
        if (!(key in values)) throw new Error(`Unknown layout placeholder [[${key}]]`);
        return values[key];
    });
}

/** Non-default languages first (sorted), default language as the final `else`. */
function orderedLanguages(locales) {
    const others = Object.keys(locales).filter((l) => l !== DEFAULT_LOCALE).sort();
    return { others, fallback: DEFAULT_LOCALE };
}

const LOCALE_PRELUDE = '{{ $loc := "" }}{{ if .Data }}{{ if .Data.locale }}{{ $loc = .Data.locale }}{{ end }}{{ end }}';

/** Wraps per-language renders into one Go-template conditional on the user locale. */
export function wrapByLocale(locales, renderFor) {
    const { others, fallback } = orderedLanguages(locales);
    let out = LOCALE_PRELUDE;
    others.forEach((lang, index) => {
        out += `{{ ${index === 0 ? 'if' : 'else if'} eq $loc "${lang}" }}${renderFor(lang)}`;
    });
    out += others.length > 0 ? `{{ else }}${renderFor(fallback)}{{ end }}` : renderFor(fallback);
    return out;
}

/** Management API field names for one event. */
export function apiFieldNames(event) {
    const { kind } = EMAIL_EVENTS[event];
    if (kind === 'auth') {
        return {
            subject: `mailer_subjects_${event}`,
            content: `mailer_templates_${event}_content`,
            enabled: null,
        };
    }
    return {
        subject: `mailer_subjects_${event}_notification`,
        content: `mailer_templates_${event}_notification_content`,
        enabled: `mailer_notifications_${event}_enabled`,
    };
}

/** Builds the complete Management API payload for `PATCH /v1/projects/{ref}/config/auth`. */
export function buildAuthConfigPayload(templatesDir) {
    const locales = loadLocales(templatesDir);
    assertLocalesComplete(locales);
    const layout = readFileSync(join(templatesDir, 'layout.html'), 'utf8');

    const payload = {
        mailer_otp_length: 6,
        mailer_secure_email_change_enabled: true,
        site_url: 'https://app.glassfolio.dev',
        uri_allow_list: 'https://app.glassfolio.dev/*,https://glassfolio.dev/*',
        mfa_totp_enroll_enabled: true,
        mfa_totp_verify_enabled: true,
        passkey_enabled: true,
        // Do NOT change the RP ID: every registered passkey (and the PRF vault slot built on it) is bound
        // to it. Narrowing it to app.glassfolio.dev would silently disable all existing passkeys.
        webauthn_rp_id: 'glassfolio.dev',
        webauthn_rp_name: 'GlassFolio',
        webauthn_rp_origins: 'https://app.glassfolio.dev,https://glassfolio.dev',
    };
    for (const event of Object.keys(EMAIL_EVENTS)) {
        const fields = apiFieldNames(event);
        payload[fields.subject] = wrapByLocale(locales, (lang) => locales[lang].events[event].subject);
        payload[fields.content] = wrapByLocale(locales, (lang) => renderHtml(layout, locales, lang, event));
        if (fields.enabled) payload[fields.enabled] = true;
    }
    return payload;
}
