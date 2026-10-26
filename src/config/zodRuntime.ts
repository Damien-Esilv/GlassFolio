import { z } from 'zod';

/**
 * zod 4 probes `new Function("")` once to decide whether it can JIT-compile schemas. Under our CSP
 * (no `unsafe-eval`, Trusted Types) the probe is blocked: harmless, but it logs a console error and
 * a `securitypolicyviolation` report in production. Declaring `jitless` skips the probe and uses the
 * interpreter, which is all we need. Import this module before any schema is parsed.
 */
z.config({ jitless: true });
