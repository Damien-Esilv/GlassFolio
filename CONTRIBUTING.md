# Contributing to GlassFolio

GlassFolio is **source-available** under the [PolyForm Noncommercial License 1.0.0](LICENSE).
You are welcome to download it, study it, modify it and propose changes, for any non-commercial use.
Commercial use or monetization of the code, modified or not, is not permitted.

## How contributions are accepted

By opening a pull request or sending a patch, you confirm that:

1. You wrote the contribution or have the right to submit it.
2. You grant the author a perpetual, worldwide, royalty-free, irrevocable license to use, modify, sublicense and distribute your contribution as part of GlassFolio, under the project license or any other license the author chooses. You keep the copyright on your own work.
3. Your contribution contains no secrets, personal data or third-party code under an incompatible license.

## Before opening a pull request

Follow `AGENTS.md` and `AI_CODING_STANDARDS.md`, then make sure these pass locally:

```bash
npm run check:types && npm run lint && npm run check:i18n && npm run check:standards && npm run test:security && npm test
```

## Reporting a security issue or a privacy request

Write to privacy@glassfolio.dev instead of opening a public issue.
