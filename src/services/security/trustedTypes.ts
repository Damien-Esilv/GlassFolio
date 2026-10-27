/**
 * Trusted Types policies (CSP `require-trusted-types-for 'script'`, see server/securityHeaders.mjs).
 *
 * With the directive on, the browser refuses raw strings in DOM sinks (innerHTML, script.src, eval…)
 * unless they come out of a named policy. Two policies exist, both deliberately narrow:
 *   - `glassfolio-qr`: HTML for the TOTP QR code, only if it is exactly the SVG our own generator draws.
 *   - `default`: lets libraries set `script.src` (Vercel Web Analytics), same-origin URLs only.
 * Browsers without Trusted Types simply run the same validation and use plain strings.
 */

export const QR_POLICY_NAME = 'glassfolio-qr';

interface PolicyRules {
    createHTML?: (input: string) => string;
    createScriptURL?: (input: string) => string;
}
interface TrustedTypesFactory {
    createPolicy(name: string, rules: PolicyRules): {
        createHTML?: (input: string) => unknown;
    };
}

const getFactory = (): TrustedTypesFactory | undefined =>
    typeof window === 'undefined'
        ? undefined
        : (window as unknown as { trustedTypes?: TrustedTypesFactory }).trustedTypes;

const COLOR = '[A-Za-z0-9#(),.% -]{1,40}';
const QR_SVG_PATTERN = new RegExp(
    '^<svg xmlns="http://www\\.w3\\.org/2000/svg" viewBox="0 0 \\d{1,4} \\d{1,4}" shape-rendering="crispEdges" width="100%" height="100%">'
    + `(?:<rect width="100%" height="100%" fill="${COLOR}"/>)?`
    + `<path d="[Mhvz0-9,. -]*" fill="${COLOR}"/></svg>$`,
);

/** Returns the SVG unchanged if it is exactly what qrCode.ts generates, otherwise an empty string. */
export const validateQrSvg = (svg: string): string => (QR_SVG_PATTERN.test(svg) ? svg : '');

let qrPolicy: ReturnType<TrustedTypesFactory['createPolicy']> | null | undefined;

/**
 * HTML value for `dangerouslySetInnerHTML`: a TrustedHTML where supported, a validated string elsewhere.
 * Anything that is not our own QR SVG becomes empty.
 */
export const toTrustedQrHtml = (svg: string): string => {
    const factory = getFactory();
    if (!factory) return validateQrSvg(svg);
    if (qrPolicy === undefined) {
        try {
            qrPolicy = factory.createPolicy(QR_POLICY_NAME, { createHTML: validateQrSvg });
        } catch {
            qrPolicy = null; // policy name already taken or refused by CSP
        }
    }
    return (qrPolicy?.createHTML ? qrPolicy.createHTML(svg) : validateQrSvg(svg)) as string;
};

/** Registers the `default` policy once. Called at startup, before any library code runs. */
export const installTrustedTypesDefaultPolicy = (): void => {
    const factory = getFactory();
    if (!factory) return;
    try {
        factory.createPolicy('default', {
            createScriptURL: (url: string) => {
                const parsed = new URL(url, window.location.href);
                // Same-origin script URLs (e.g. /_vercel/insights/script.js, bundled chunks)
                if (parsed.origin === window.location.origin) {
                    return url;
                }
                // Cloudflare Turnstile anti-bot script (Epic E22)
                if (parsed.origin === 'https://challenges.cloudflare.com' && parsed.pathname.startsWith('/turnstile/v0/')) {
                    return url;
                }
                throw new TypeError(`Blocked cross-origin script URL: ${url}`);
            },
        });
    } catch {
        // already installed (hot reload) or the browser refused it
    }
};
