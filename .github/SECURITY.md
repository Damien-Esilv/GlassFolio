# Security policy

GlassFolio keeps financial data end-to-end encrypted in the browser, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Email **privacy@glassfolio.dev** with the subject `SECURITY`, including:

- what you found and where (URL, file, or component);
- steps to reproduce, and the impact you think it has;
- your name or handle if you want to be credited.

You will get an acknowledgement within 5 business days. Fixes are shipped on `main` and announced once users have had a chance to update.

## Scope

In scope: the web app (`app.glassfolio.dev`, the self-hosted Docker image), the showcase site (`glassfolio.dev`), the encrypted vault and authentication flows, and the repository's CI/CD.

Out of scope: social engineering, denial of service through volume, third-party services (Supabase, Vercel, AI providers), and reports from automated scanners without a demonstrated impact.

## Supported versions

Only the latest release on `main` is supported.

## Good-faith research

Testing against your own account or your own self-hosted instance, without accessing other people's data, is welcome and will not be pursued.

The machine-readable contact is published at `/.well-known/security.txt` ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).
