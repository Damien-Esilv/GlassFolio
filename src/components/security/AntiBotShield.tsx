import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import {
    antiBotService,
    AntiBotVerificationParams,
    getTurnstileSiteKey,
    isTurnstileEnabled,
} from '../../services/security/antiBotService';
import { Result, ValidationError } from '../../types/result';

export interface AntiBotShieldHandle {
    getPayload(): AntiBotVerificationParams;
    validate(options?: { minDurationMs?: number; skipPow?: boolean }): Promise<Result<boolean, ValidationError>>;
}

interface AntiBotShieldProps {
    onPayloadChange?: (payload: AntiBotVerificationParams) => void;
}

export const AntiBotShield = forwardRef<AntiBotShieldHandle, AntiBotShieldProps>(
    ({ onPayloadChange }, ref) => {
        const [honeypot, setHoneypot] = useState('');
        const [powData, setPowData] = useState<{ challenge: string; nonce: number; hash: string }>({
            challenge: '',
            nonce: 0,
            hash: '',
        });
        const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
        const mountedAtRef = useRef<number>(Date.now());
        const turnstileContainerRef = useRef<HTMLDivElement | null>(null);

        // Pre-compute Proof-of-Work challenge in background on mount
        useEffect(() => {
            mountedAtRef.current = Date.now();
            let isCancelled = false;

            const runPow = async () => {
                const challenge = antiBotService.createChallenge();
                try {
                    const solution = await antiBotService.solveChallenge(challenge);
                    if (!isCancelled) {
                        const nextPow = {
                            challenge,
                            nonce: solution.nonce,
                            hash: solution.hash,
                        };
                        setPowData(nextPow);
                    }
                } catch (err) {
                    console.warn('[AntiBotShield] PoW generation error', err);
                }
            };

            runPow();

            return () => {
                isCancelled = true;
            };
        }, []);

        // Optional Cloudflare Turnstile integration
        useEffect(() => {
            if (!isTurnstileEnabled() || typeof window === 'undefined') return;
            const siteKey = getTurnstileSiteKey();
            if (!siteKey || !turnstileContainerRef.current) return;

            type WindowWithTurnstile = Window & {
                turnstile?: {
                    render: (
                        container: HTMLElement | string,
                        options: {
                            sitekey: string;
                            callback: (token: string) => void;
                            'error-callback'?: () => void;
                            theme?: 'light' | 'dark' | 'auto';
                        }
                    ) => string;
                    reset: (widgetId: string) => void;
                };
            };

            const win = window as unknown as WindowWithTurnstile;

            let widgetId: string | undefined;
            if (win.turnstile && turnstileContainerRef.current) {
                try {
                    widgetId = win.turnstile.render(turnstileContainerRef.current, {
                        sitekey: siteKey,
                        callback: (token: string) => setCaptchaToken(token),
                        theme: 'auto',
                    });
                } catch (e) {
                    console.warn('[AntiBotShield] Turnstile render failure', e);
                }
            }

            return () => {
                if (widgetId && win.turnstile) {
                    try {
                        win.turnstile.reset(widgetId);
                    } catch {
                        // ignore cleanup error
                    }
                }
            };
        }, []);

        const getCurrentPayload = (): AntiBotVerificationParams => ({
            honeypot,
            mountedAt: mountedAtRef.current,
            submittedAt: Date.now(),
            powChallenge: powData.challenge,
            powNonce: powData.nonce,
            powHash: powData.hash,
            captchaToken,
        });

        useEffect(() => {
            if (onPayloadChange) {
                onPayloadChange(getCurrentPayload());
            }
        }, [honeypot, powData, captchaToken, onPayloadChange]);

        useImperativeHandle(ref, () => ({
            getPayload: getCurrentPayload,
            validate: async (options) => {
                return antiBotService.verify(getCurrentPayload(), options);
            },
        }));

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
                {isTurnstileEnabled() && (
                    <div className="my-2 flex justify-center" ref={turnstileContainerRef} />
                )}
            </>
        );
    }
);

AntiBotShield.displayName = 'AntiBotShield';
