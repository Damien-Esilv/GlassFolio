import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef, useCallback } from 'react';
import {
    antiBotService,
    AntiBotVerificationParams,
    getTurnstileSiteKey,
    isTurnstileEnabled,
} from '../../services/security/antiBotService';
import { Result, ValidationError } from '../../types/result';

export interface AntiBotShieldHandle {
    getPayload(): AntiBotVerificationParams;
    validate(options?: { minDurationMs?: number; skipPow?: boolean; skipTurnstile?: boolean }): Promise<Result<boolean, ValidationError>>;
    reset(): void;
}

interface AntiBotShieldProps {
    onPayloadChange?: (payload: AntiBotVerificationParams) => void;
    skipTurnstile?: boolean;
}

interface WindowWithTurnstile extends Window {
    turnstile?: {
        render: (
            container: HTMLElement | string,
            options: {
                sitekey: string;
                callback: (token: string) => void;
                'error-callback'?: () => void;
                'expired-callback'?: () => void;
                theme?: 'light' | 'dark' | 'auto';
            }
        ) => string;
        reset: (widgetId: string) => void;
        remove?: (widgetId: string) => void;
    };
}

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const INITIAL_POW_DATA = { challenge: '', nonce: 0, hash: '' };

function loadTurnstileScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    const win = window as unknown as WindowWithTurnstile;
    if (win.turnstile) return Promise.resolve();

    const existing = document.querySelector<HTMLScriptElement>(
        'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );
    if (existing) {
        return new Promise((resolve) => {
            if (win.turnstile) {
                resolve();
            } else {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => resolve(), { once: true });
            }
        });
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = (e) => {
            console.warn('[AntiBotShield] Failed to load Turnstile script', e);
            resolve();
        };
        document.head.appendChild(script);
    });
}

export const AntiBotShield = forwardRef<AntiBotShieldHandle, AntiBotShieldProps>(
    ({ onPayloadChange, skipTurnstile = false }, ref) => {
        const [honeypot, setHoneypot] = useState('');
        const [powData, setPowData] = useState<{ challenge: string; nonce: number; hash: string }>(INITIAL_POW_DATA);
        const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);

        const mountedAtRef = useRef<number>(Date.now());
        const powDataRef = useRef<{ challenge: string; nonce: number; hash: string }>(INITIAL_POW_DATA);
        const captchaTokenRef = useRef<string | undefined>(undefined);
        const powPromiseRef = useRef<Promise<void> | null>(null);
        const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
        const widgetIdRef = useRef<string | undefined>(undefined);

        // Synchronize state and refs
        powDataRef.current = powData;
        captchaTokenRef.current = captchaToken;

        const startPow = useCallback(() => {
            let isCancelled = false;
            const promise = (async () => {
                const challenge = antiBotService.createChallenge();
                try {
                    const solution = await antiBotService.solveChallenge(challenge);
                    if (!isCancelled) {
                        const nextPow = {
                            challenge,
                            nonce: solution.nonce,
                            hash: solution.hash,
                        };
                        powDataRef.current = nextPow;
                        setPowData(nextPow);
                    }
                } catch (err) {
                    console.warn('[AntiBotShield] PoW generation error', err);
                }
            })();

            powPromiseRef.current = promise;
            return () => {
                isCancelled = true;
            };
        }, []);

        // Pre-compute Proof-of-Work challenge in background on mount
        useEffect(() => {
            mountedAtRef.current = Date.now();
            const cancel = startPow();
            return () => {
                cancel();
            };
        }, [startPow]);

        // Optional Cloudflare Turnstile integration
        useEffect(() => {
            if (skipTurnstile || !isTurnstileEnabled() || typeof window === 'undefined') return;
            const siteKey = getTurnstileSiteKey();
            if (!siteKey || !turnstileContainerRef.current) return;

            let isCancelled = false;

            const isLight =
                typeof document !== 'undefined' &&
                document.documentElement.getAttribute('data-theme') === 'light';
            const theme: 'light' | 'dark' = isLight ? 'light' : 'dark';

            loadTurnstileScript().then(() => {
                if (isCancelled || !turnstileContainerRef.current) return;
                const win = window as unknown as WindowWithTurnstile;
                if (!win.turnstile) return;

                try {
                    if (widgetIdRef.current !== undefined) {
                        try {
                            win.turnstile.reset(widgetIdRef.current);
                        } catch {
                            // ignore reset error
                        }
                    }

                    widgetIdRef.current = win.turnstile.render(turnstileContainerRef.current, {
                        sitekey: siteKey,
                        theme,
                        callback: (token: string) => {
                            if (!isCancelled) {
                                captchaTokenRef.current = token;
                                setCaptchaToken(token);
                            }
                        },
                        'expired-callback': () => {
                            if (!isCancelled) {
                                captchaTokenRef.current = undefined;
                                setCaptchaToken(undefined);
                            }
                        },
                        'error-callback': () => {
                            if (!isCancelled) {
                                captchaTokenRef.current = undefined;
                                setCaptchaToken(undefined);
                            }
                        },
                    });
                } catch (e) {
                    console.warn('[AntiBotShield] Turnstile render failure', e);
                }
            });

            return () => {
                isCancelled = true;
                const widgetId = widgetIdRef.current;
                if (widgetId !== undefined && typeof window !== 'undefined') {
                    const win = window as unknown as WindowWithTurnstile;
                    if (win.turnstile) {
                        try {
                            if (win.turnstile.remove) {
                                win.turnstile.remove(widgetId);
                            } else {
                                win.turnstile.reset(widgetId);
                            }
                        } catch {
                            // ignore cleanup error
                        }
                    }
                    widgetIdRef.current = undefined;
                }
            };
        }, [skipTurnstile]);

        const getCurrentPayload = useCallback((): AntiBotVerificationParams => ({
            honeypot,
            mountedAt: mountedAtRef.current,
            submittedAt: Date.now(),
            powChallenge: powDataRef.current.challenge,
            powNonce: powDataRef.current.nonce,
            powHash: powDataRef.current.hash,
            captchaToken: captchaTokenRef.current,
        }), [honeypot]);

        useEffect(() => {
            if (onPayloadChange) {
                onPayloadChange(getCurrentPayload());
            }
        }, [honeypot, powData, captchaToken, getCurrentPayload, onPayloadChange]);

        const reset = useCallback(() => {
            captchaTokenRef.current = undefined;
            setCaptchaToken(undefined);
            if (widgetIdRef.current !== undefined && typeof window !== 'undefined') {
                const win = window as unknown as WindowWithTurnstile;
                if (win.turnstile) {
                    try {
                        win.turnstile.reset(widgetIdRef.current);
                    } catch {
                        // ignore reset error
                    }
                }
            }
            mountedAtRef.current = Date.now();
            startPow();
        }, [startPow]);

        useImperativeHandle(ref, () => ({
            getPayload: getCurrentPayload,
            validate: async (options) => {
                if (powPromiseRef.current) {
                    await powPromiseRef.current;
                }
                return antiBotService.verify(getCurrentPayload(), options);
            },
            reset,
        }), [getCurrentPayload, reset]);

        return (
            <>
                {/* Honeypot field (hidden from accessibility tree and visual viewport, attractive to simple bots) */}
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        opacity: 0,
                        zIndex: -1,
                        pointerEvents: 'none',
                        height: 0,
                        overflow: 'hidden',
                        margin: 0,
                        padding: 0,
                    }}
                >
                    <label htmlFor="sys_telemetry_honeypot_field">System Telemetry</label>
                    <input
                        id="sys_telemetry_honeypot_field"
                        name="sys_telemetry_honeypot_field"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={honeypot}
                        onChange={(e) => setHoneypot(e.target.value)}
                    />
                </div>

                {/* Optional Cloudflare Turnstile container */}
                {isTurnstileEnabled() && !skipTurnstile && (
                    <div className="mt-6 mb-3 flex justify-center min-h-[65px]" ref={turnstileContainerRef} />
                )}
            </>
        );
    }
);

AntiBotShield.displayName = 'AntiBotShield';
