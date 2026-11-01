import { describe, it, expect } from 'vitest';
import { generateQrMatrix, generateQrSvg } from '../../../../src/services/security/qrCode';

describe('qrCode generator', () => {
    it('generates non-empty boolean matrix with correct finder patterns', () => {
        const text = 'otpauth://totp/GlassFolio:alex%40glassfolio.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GlassFolio&period=30';
        const matrix = generateQrMatrix(text);

        expect(matrix.length).toBeGreaterThan(20);
        expect(matrix[0].length).toBe(matrix.length);

        // Check top-left finder pattern center (3,3)
        expect(matrix[3][3]).toBe(true);
        // Check top-left finder pattern border (0,0)
        expect(matrix[0][0]).toBe(true);
        // Check top-left separator (7,7)
        expect(matrix[7][7]).toBe(false);
    });

    it('generates valid SVG string with viewBox and path elements', () => {
        const text = 'otpauth://totp/GlassFolio:test?secret=JBSWY3DPEHPK3PXP';
        const svg = generateQrSvg(text);

        expect(svg).toContain('<svg');
        expect(svg).toContain('viewBox=');
        expect(svg).toContain('<path');
        expect(svg).toContain('</svg>');

        // Test transparent background and custom color options
        const transparentSvg = generateQrSvg(text, { bg: 'transparent', color: 'black', margin: 2 });
        expect(transparentSvg).not.toContain('<rect');
        expect(transparentSvg).toContain('fill="black"');
    });

    it('sanitizes malicious SVG attributes in color, bg, and margin options', () => {
        const text = 'otpauth://totp/GlassFolio:test?secret=JBSWY3DPEHPK3PXP';
        const svg = generateQrSvg(text, {
            color: '"><script>alert(1)</script><path fill="',
            bg: '" onload="alert(1)',
            margin: -10,
        });

        expect(svg).not.toContain('<script>');
        expect(svg).not.toContain('onload=');
        expect(svg).toContain('fill="black"');
        expect(svg).toContain('fill="white"');
    });
});
