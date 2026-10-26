import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Architectural Invariant Guard:
 * AGENTS.md & AI_CODING_STANDARDS.md specify:
 * "Data access: les composants/pages ne touchent jamais localStorage directement ; passer par src/services/."
 *
 * To prevent developer bypass of client-side envelope encryption,
 * NO file in src/, pages/, components/, context/, or hooks/ may directly
 * access localStorage or sessionStorage outside of the designated storage abstraction layer:
 *   - src/types/storage.ts
 *   - src/services/storage/**
 *   - src/services/security/**
 */

function getAllSourceFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;

    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== 'dist' && file !== 'coverage' && file !== '.git') {
                getAllSourceFiles(fullPath, arrayOfFiles);
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');

            // Skip test directories and mock files
            if (
                !relativePath.startsWith('tests/') &&
                !relativePath.includes('.test.') &&
                !relativePath.includes('.spec.') &&
                !relativePath.includes('vite.config') &&
                !relativePath.includes('vitest.config')
            ) {
                arrayOfFiles.push(relativePath);
            }
        }
    });

    return arrayOfFiles;
}

function isAllowlisted(filePath: string): boolean {
    if (filePath.startsWith('src/services/security/')) return true;
    if (filePath.startsWith('src/services/storage/')) return true;
    if (filePath === 'src/types/storage.ts' || filePath.endsWith('src/types/storage.ts')) return true;
    return false;
}

function stripComments(code: string): string {
    // Replace multi-line comments with same number of newlines to preserve line numbers
    let result = code.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        const lineCount = (match.match(/\n/g) || []).length;
        return '\n'.repeat(lineCount);
    });

    // Replace single-line comments
    result = result.replace(/\/\/.*$/gm, '');
    return result;
}

describe('Architectural Invariant — Zero Direct localStorage / sessionStorage Bypass', () => {
    it('prohibits direct references to localStorage and sessionStorage outside allowed storage layer', () => {
        const directoriesToScan = ['src'];
        const filesToScan: string[] = [];

        directoriesToScan.forEach((dir) => {
            getAllSourceFiles(path.join(process.cwd(), dir), filesToScan);
        });

        expect(filesToScan.length).toBeGreaterThan(100);

        const forbiddenRegex = /\b(?:(?:window|globalThis)\.)?(?:localStorage|sessionStorage)\./g;
        const violations: { file: string; line: number; match: string; content: string }[] = [];

        filesToScan.forEach((filePath) => {
            if (isAllowlisted(filePath)) {
                return;
            }

            const rawContent = fs.readFileSync(path.join(process.cwd(), filePath), 'utf-8');
            const strippedContent = stripComments(rawContent);
            const lines = strippedContent.split('\n');
            const originalLines = rawContent.split('\n');

            lines.forEach((lineText, lineIdx) => {
                const matches = lineText.match(forbiddenRegex);
                if (matches) {
                    matches.forEach((match) => {
                        violations.push({
                            file: filePath,
                            line: lineIdx + 1,
                            match,
                            content: originalLines[lineIdx].trim(),
                        });
                    });
                }
            });
        });

        if (violations.length > 0) {
            const violationSummary = violations
                .map((v) => `  - ${v.file}:${v.line} -> "${v.match}" in line: "${v.content}"`)
                .join('\n');

            expect.fail(
                `Found ${violations.length} direct localStorage/sessionStorage call(s) bypassing encryption:\n${violationSummary}\n\nAll components and services MUST use appStorage or dedicated services from src/services/.`
            );
        } else {
            expect(violations.length).toBe(0);
        }
    });
});
