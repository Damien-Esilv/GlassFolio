import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    buildAuthConfigPayload,
    assertLocalesComplete,
    loadLocales,
    EMAIL_EVENTS,
    apiFieldNames,
} from '../../../scripts/lib/emailTemplates.mjs';

const TEMPLATES_DIR = join(process.cwd(), 'supabase', 'templates');

describe('Email template builder (Epic E25 — TGLA-084)', () => {
    const payload = buildAuthConfigPayload(TEMPLATES_DIR) as Record<string, string | number | boolean>;

    it('produces subject + content for every event and enables notifications', () => {
        for (const event of Object.keys(EMAIL_EVENTS)) {
            const fields = apiFieldNames(event) as { subject: string; content: string; enabled: string | null };
            expect(typeof payload[fields.subject]).toBe('string');
            expect(typeof payload[fields.content]).toBe('string');
            if (fields.enabled) expect(payload[fields.enabled]).toBe(true);
        }
        expect(payload.mailer_otp_length).toBe(6);
    });

    it('branches on .Data.locale for every language with English as fallback', () => {
        const html = payload.mailer_templates_confirmation_content as string;
        expect(html).toContain('{{ if eq $loc "fr" }}');
        expect(html).toContain('{{ else }}');
        expect(html).toContain('Confirmez votre adresse email');
        expect(html).toContain('Confirm your email address');
        expect(payload.mailer_subjects_confirmation).toContain('Confirmez votre compte Glassfolio');
    });

    it('confirmation email carries both the OTP code and the confirmation link', () => {
        const html = payload.mailer_templates_confirmation_content as string;
        expect(html).toContain('{{ .Token }}');
        expect(html).toContain('{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup');
    });

    it('notification emails never expose a code or action link', () => {
        const html = payload.mailer_templates_password_changed_notification_content as string;
        expect(html).not.toContain('{{ .Token }}');
        expect(html).not.toContain('<a href=');
    });

    it('uses the provider and address variables of identity/email notifications', () => {
        expect(payload.mailer_templates_identity_linked_notification_content).toContain('{{ .Provider }}');
        expect(payload.mailer_templates_email_changed_notification_content).toContain('{{ .OldEmail }}');
    });

    it('leaves no unresolved [[placeholder]] in any template', () => {
        for (const value of Object.values(payload)) {
            if (typeof value === 'string') expect(value).not.toMatch(/\[\[\w+\]\]/);
        }
    });

    it('supports a new language by only adding a locale JSON file', () => {
        const dir = mkdtempSync(join(tmpdir(), 'gf-email-'));
        cpSync(TEMPLATES_DIR, dir, { recursive: true });
        const en = JSON.parse(JSON.stringify(loadLocales(TEMPLATES_DIR).en)) as {
            events: Record<string, Record<string, string>>;
        };
        en.events.confirmation.heading = 'Confirma tu correo';
        writeFileSync(join(dir, 'i18n', 'es.json'), JSON.stringify(en));

        const extended = buildAuthConfigPayload(dir) as unknown as Record<string, string>;
        expect(extended.mailer_templates_confirmation_content).toContain('{{ if eq $loc "es" }}');
        expect(extended.mailer_templates_confirmation_content).toContain('{{ else if eq $loc "fr" }}');
        expect(extended.mailer_templates_confirmation_content).toContain('Confirma tu correo');
    });

    it('fails fast when a language is missing a string', () => {
        const locales = loadLocales(TEMPLATES_DIR) as Record<string, { layout: Record<string, string>; events: Record<string, Record<string, string>> }>;
        const broken = {
            en: locales.en,
            de: { layout: locales.en.layout, events: { ...locales.en.events, confirmation: { subject: 'x' } } },
        };
        expect(() => assertLocalesComplete(broken)).toThrow(/de: events\.confirmation\.heading/);
    });

    it('requires the default locale', () => {
        const dir = mkdtempSync(join(tmpdir(), 'gf-email-nodefault-'));
        mkdirSync(join(dir, 'i18n'));
        writeFileSync(join(dir, 'i18n', 'fr.json'), '{}');
        expect(() => loadLocales(dir)).toThrow(/Default locale/);
    });
});
