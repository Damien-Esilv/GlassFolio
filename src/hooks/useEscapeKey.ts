import { useEffect, useRef } from 'react';

/**
 * Closes a dialog with the Escape key.
 *
 * Dialogs stack: only the one opened last reacts, so Escape in a confirmation shown over a modal
 * closes the confirmation, not both.
 */
const stack: Array<{ current: () => void }> = [];

const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || stack.length === 0) return;
    event.preventDefault();
    stack[stack.length - 1].current();
};

export function useEscapeKey(onEscape: () => void, active: boolean = true): void {
    const handler = useRef(onEscape);
    handler.current = onEscape;

    useEffect(() => {
        if (!active) return;
        const entry = { get current() { return handler.current; } };
        stack.push(entry);
        if (stack.length === 1) document.addEventListener('keydown', onKeyDown);
        return () => {
            const index = stack.indexOf(entry);
            if (index !== -1) stack.splice(index, 1);
            if (stack.length === 0) document.removeEventListener('keydown', onKeyDown);
        };
    }, [active]);
}
