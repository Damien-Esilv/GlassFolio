/**
 * ISO/IEC 18004 Compliant QR Code Generator for 2FA / TOTP.
 *
 * Utilizes the battle-tested, standard `qrcode` engine for exact Reed-Solomon error correction,
 * optimal penalty-scored masking, and full compatibility with iOS Camera and Authenticator apps.
 */

import QRCode from 'qrcode';

/**
 * Generates a 2D boolean matrix representing the QR code modules (true = dark, false = light).
 */
export const generateQrMatrix = (text: string): boolean[][] => {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const matrix: boolean[][] = [];

    for (let r = 0; r < size; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < size; c++) {
            row.push(Boolean(qr.modules.get(r, c)));
        }
        matrix.push(row);
    }

    return matrix;
};

/**
 * Returns a standalone, responsive, ISO-compliant SVG string for the QR code.
 * Uses a standard quiet zone margin (minimum 4 modules) to guarantee immediate scanning.
 */
const sanitizeSvgAttribute = (val: string): string =>
    val.replace(/[&<>"']/g, (char) => {
        switch (char) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return char;
        }
    });

export const generateQrSvg = (
    text: string,
    options?: { size?: number; margin?: number; color?: string; bg?: string }
): string => {
    const matrix = generateQrMatrix(text);
    const size = matrix.length;
    const margin = options?.margin ?? 4;
    const totalSize = size + margin * 2;
    const fg = sanitizeSvgAttribute(options?.color || 'black');
    const bg = sanitizeSvgAttribute(options?.bg || 'white');

    let pathData = '';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (matrix[r][c]) {
                const x = c + margin;
                const y = r + margin;
                pathData += `M${x},${y}h1v1h-1z `;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges" width="100%" height="100%">` +
        (bg !== 'transparent' ? `<rect width="100%" height="100%" fill="${bg}"/>` : '') +
        `<path d="${pathData.trim()}" fill="${fg}"/>` +
        `</svg>`;
};
