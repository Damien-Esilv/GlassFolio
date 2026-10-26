
export interface ParsedData {
    headers: string[];
    rows: string[][];
}

export const parseCSV = (text: string): ParsedData => {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return { headers: [], rows: [] };

    const firstLine = lines[0];

    // Detect delimiter
    const delimiters = [',', ';', '\t', '|'];
    let detectedDelimiter = ',';
    let maxCount = 0;

    delimiters.forEach(d => {
        const count = firstLine.split(d).length - 1;
        if (count > maxCount) {
            maxCount = count;
            detectedDelimiter = d;
        }
    });

    const splitLine = (line: string) => {
        const result = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === detectedDelimiter && !inQuote) {
                result.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim().replace(/^"|"$/g, ''));
        return result;
    };

    const headers = splitLine(lines[0]);
    const rows = lines.slice(1).map(splitLine);

    return { headers, rows };
};
