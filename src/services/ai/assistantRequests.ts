/**
 * A page asks the in-app assistant something (Epic E52: "Categorise with the assistant"): the panel opens with the
 * request typed in, and the user sends it. Nothing is sent on their behalf (consent, provider choice stay theirs).
 */
export const ASK_ASSISTANT_EVENT = 'glassfolio:ask-assistant';

export function askAssistant(prompt: string): void {
    window.dispatchEvent(new CustomEvent<{ prompt: string }>(ASK_ASSISTANT_EVENT, { detail: { prompt } }));
}

/** Calls `handler` with each request; returns the unsubscribe. */
export function onAskAssistant(handler: (prompt: string) => void): () => void {
    const listener = (event: Event) => {
        const prompt = (event as CustomEvent<{ prompt?: unknown }>).detail?.prompt;
        if (typeof prompt === 'string' && prompt.trim()) handler(prompt);
    };
    window.addEventListener(ASK_ASSISTANT_EVENT, listener);
    return () => window.removeEventListener(ASK_ASSISTANT_EVENT, listener);
}
