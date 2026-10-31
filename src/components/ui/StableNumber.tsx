import React from 'react';

interface StableNumberProps {
    /** Text shown right now (a step of the count). */
    display: string;
    /** Text the count ends on; it fixes the width from the first frame. */
    final: string;
    /** Hidden from screen readers when the parent already labels the final value. */
    hidden?: boolean;
}

/**
 * A number that is being counted up. The final text is carried by an invisible ::before in the same
 * grid cell as the moving text (`data-final`), so the box is as wide as the final value from the first
 * frame and never grows, shrinks or wraps onto another line while the digits change. Digits are
 * tabular for the same reason. The invisible copy is CSS only: it is not in the DOM text, so it is
 * neither read nor copied.
 */
export const StableNumber: React.FC<StableNumberProps> = ({ display, final, hidden = false }) => (
    <span
        data-final={final}
        aria-hidden={hidden ? 'true' : undefined}
        className="inline-grid whitespace-nowrap tabular-nums before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-final)]"
    >
        <span className="col-start-1 row-start-1">{display}</span>
    </span>
);

export default StableNumber;
