/**
 * Pure TypeScript Zero-Dependency QR Code Generator.
 *
 * Supports Byte mode (UTF-8), Error Correction Level M/L, versions 1 to 10.
 * Produces clean SVG strings with crisp vector paths and zero external libraries.
 */

// ── Reed-Solomon GF(256) Math ────────────────────────────────────────────────

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) {
        EXP[i] = EXP[i - 255];
    }
})();

const gfMul = (a: number, b: number): number => {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
};

const rsGeneratorPoly = (degree: number): Uint8Array => {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
        const next = new Uint8Array(poly.length + 1);
        const factor = EXP[i];
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= gfMul(poly[j], factor);
            next[j + 1] ^= poly[j];
        }
        poly = next;
    }
    return poly;
};

const rsComputeRemainder = (data: Uint8Array, ecCount: number): Uint8Array => {
    const gen = rsGeneratorPoly(ecCount);
    const remainder = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
        const factor = data[i] ^ remainder[0];
        for (let j = 0; j < ecCount - 1; j++) {
            remainder[j] = remainder[j + 1] ^ gfMul(gen[j + 1], factor);
        }
        remainder[ecCount - 1] = gfMul(gen[ecCount], factor);
    }
    return remainder;
};

// ── QR Code Version Capacities & EC Tables (Level M) ─────────────────────────

interface VersionTable {
    version: number;
    totalCodewords: number;
    ecCodewordsPerBlock: number;
    numBlocks: number;
    dataCapacity: number;
}

// Byte mode capacities for Level M (sufficient for OTP URIs up to ~160 chars)
const VERSIONS: VersionTable[] = [
    { version: 1, totalCodewords: 26, ecCodewordsPerBlock: 10, numBlocks: 1, dataCapacity: 14 },
    { version: 2, totalCodewords: 44, ecCodewordsPerBlock: 16, numBlocks: 1, dataCapacity: 26 },
    { version: 3, totalCodewords: 70, ecCodewordsPerBlock: 26, numBlocks: 1, dataCapacity: 42 },
    { version: 4, totalCodewords: 100, ecCodewordsPerBlock: 18, numBlocks: 2, dataCapacity: 62 },
    { version: 5, totalCodewords: 134, ecCodewordsPerBlock: 24, numBlocks: 2, dataCapacity: 84 },
    { version: 6, totalCodewords: 172, ecCodewordsPerBlock: 16, numBlocks: 4, dataCapacity: 106 },
    { version: 7, totalCodewords: 196, ecCodewordsPerBlock: 18, numBlocks: 4, dataCapacity: 122 },
    { version: 8, totalCodewords: 242, ecCodewordsPerBlock: 22, numBlocks: 4, dataCapacity: 152 },
    { version: 9, totalCodewords: 292, ecCodewordsPerBlock: 22, numBlocks: 5, dataCapacity: 180 },
    { version: 10, totalCodewords: 346, ecCodewordsPerBlock: 26, numBlocks: 5, dataCapacity: 213 },
];

const selectVersion = (dataLen: number): VersionTable => {
    for (const v of VERSIONS) {
        if (v.dataCapacity >= dataLen) return v;
    }
    return VERSIONS[VERSIONS.length - 1];
};

// ── Bit Stream & Data Codeword Encoding ──────────────────────────────────────

class BitBuffer {
    public buffer: number[] = [];
    public length = 0;

    public put(val: number, bits: number): void {
        for (let i = bits - 1; i >= 0; i--) {
            this.putBit(((val >>> i) & 1) === 1);
        }
    }

    public putBit(bit: boolean): void {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
            this.buffer.push(0);
        }
        if (bit) {
            this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
        }
        this.length++;
    }

    public getBytes(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}

const encodeData = (text: string, v: VersionTable): Uint8Array => {
    const encoder = new TextEncoder();
    const rawBytes = encoder.encode(text);
    const bits = new BitBuffer();

    // Mode: Byte = 0100
    bits.put(4, 4);

    // Character count indicator (8 bits for v1-9, 16 for v10+)
    const countBits = v.version < 10 ? 8 : 16;
    bits.put(rawBytes.length, countBits);

    // Data bytes
    for (let i = 0; i < rawBytes.length; i++) {
        bits.put(rawBytes[i], 8);
    }

    // Terminator (up to 4 zeroes)
    const capacityBits = v.dataCapacity * 8;
    const termLen = Math.min(4, capacityBits - bits.length);
    bits.put(0, termLen);

    // Byte alignment
    while (bits.length % 8 !== 0) {
        bits.putBit(false);
    }

    // Pad bytes 0xEC, 0x11
    let pad = 0xec;
    while (bits.length < capacityBits) {
        bits.put(pad, 8);
        pad = pad === 0xec ? 0x11 : 0xec;
    }

    const dataCodewords = bits.getBytes();

    // Split into blocks and add Reed-Solomon EC
    const dataPerBlock = Math.floor(v.dataCapacity / v.numBlocks);
    const dataBlocks: Uint8Array[] = [];
    const ecBlocks: Uint8Array[] = [];

    let offset = 0;
    for (let b = 0; b < v.numBlocks; b++) {
        const blkLen = dataPerBlock + (b >= v.numBlocks - (v.dataCapacity % v.numBlocks) ? 1 : 0);
        const chunk = dataCodewords.slice(offset, offset + blkLen);
        dataBlocks.push(chunk);
        ecBlocks.push(rsComputeRemainder(chunk, v.ecCodewordsPerBlock));
        offset += blkLen;
    }

    // Interleave
    const result = new Uint8Array(v.totalCodewords);
    let outIdx = 0;

    // Interleave data
    const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxDataLen; i++) {
        for (let b = 0; b < v.numBlocks; b++) {
            if (i < dataBlocks[b].length) {
                result[outIdx++] = dataBlocks[b][i];
            }
        }
    }

    // Interleave EC
    for (let i = 0; i < v.ecCodewordsPerBlock; i++) {
        for (let b = 0; b < v.numBlocks; b++) {
            result[outIdx++] = ecBlocks[b][i];
        }
    }

    return result;
};

// ── Matrix Layout & Patterns ─────────────────────────────────────────────────

const ALIGNMENT_PATTERN_POSITIONS: number[][] = [
    [],
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
];

export const generateQrMatrix = (text: string): boolean[][] => {
    const v = selectVersion(new TextEncoder().encode(text).length);
    const size = v.version * 4 + 17;
    const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

    // 1. Finder patterns (7x7) + separators
    const placeFinder = (startRow: number, startCol: number) => {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const row = startRow + r;
                const col = startCol + c;
                if (row >= 0 && row < size && col >= 0 && col < size) {
                    if (r === -1 || r === 7 || c === -1 || c === 7) {
                        matrix[row][col] = false; // separator
                    } else if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                        matrix[row][col] = true;
                    } else {
                        matrix[row][col] = false;
                    }
                }
            }
        }
    };

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // 2. Timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0;
        matrix[i][6] = i % 2 === 0;
    }

    // 3. Alignment patterns (version >= 2)
    const alignPos = ALIGNMENT_PATTERN_POSITIONS[v.version] || [];
    for (const r of alignPos) {
        for (const c of alignPos) {
            if (matrix[r][c] !== null) continue;
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
                    const isCenter = dr === 0 && dc === 0;
                    matrix[r + dr][c + dc] = isBorder || isCenter;
                }
            }
        }
    }

    // 4. Reserve format info areas
    for (let i = 0; i < 9; i++) {
        if (matrix[8][i] === null) matrix[8][i] = false;
        if (matrix[i][8] === null) matrix[i][8] = false;
    }
    for (let i = size - 8; i < size; i++) {
        if (matrix[8][i] === null) matrix[8][i] = false;
        if (matrix[i][8] === null) matrix[i][8] = false;
    }
    // Dark module
    matrix[size - 8][8] = true;

    // 5. Data codewords bit placement
    const codewords = encodeData(text, v);
    let bitIdx = 0;
    const totalBits = codewords.length * 8;

    let right = size - 1;
    let upward = true;

    while (right > 0) {
        if (right === 6) right--; // skip timing column

        for (let vert = 0; vert < size; vert++) {
            const row = upward ? size - 1 - vert : vert;
            for (let c = 0; c < 2; c++) {
                const col = right - c;
                if (matrix[row][col] === null) {
                    let bit = false;
                    if (bitIdx < totalBits) {
                        const byteIndex = Math.floor(bitIdx / 8);
                        const bitPos = 7 - (bitIdx % 8);
                        bit = ((codewords[byteIndex] >>> bitPos) & 1) === 1;
                        bitIdx++;
                    }

                    // Mask pattern 0: (row + col) % 2 === 0
                    const mask = (row + col) % 2 === 0;
                    matrix[row][col] = bit !== mask;
                }
            }
        }
        upward = !upward;
        right -= 2;
    }

    // 6. Format info bits (Level M = 00, Mask 0 = 000 => 00000 with BCH 10100110111 => 0x5412 XOR)
    // Precomputed 15-bit format info for Level M + Mask 0: 0x5412 ^ 0x0000 = 0x5412 (binary 101010000010010)
    const formatInfo = 0x5412;
    const formatBits: boolean[] = [];
    for (let i = 14; i >= 0; i--) {
        formatBits.push(((formatInfo >>> i) & 1) === 1);
    }

    // Top-left
    const positionsTL: [number, number][] = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
        [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    for (let i = 0; i < 15; i++) {
        const [r, c] = positionsTL[i];
        matrix[r][c] = formatBits[i];
    }

    // Split across top-right and bottom-left
    for (let i = 0; i < 8; i++) {
        matrix[size - 1 - i][8] = formatBits[i];
    }
    for (let i = 0; i < 7; i++) {
        matrix[8][size - 7 + i] = formatBits[8 + i];
    }

    return matrix as boolean[][];
};

/**
 * Returns a standalone, responsive SVG string for the QR code.
 */
export const generateQrSvg = (text: string, options?: { size?: number; margin?: number; color?: string; bg?: string }): string => {
    const matrix = generateQrMatrix(text);
    const size = matrix.length;
    const margin = options?.margin ?? 2;
    const totalSize = size + margin * 2;
    const fg = options?.color || 'currentColor';
    const bg = options?.bg || 'transparent';

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
