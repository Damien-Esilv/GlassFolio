import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Section 1.1 Enforcement Test:
 * AI_CODING_STANDARDS.md Section 1.1 states:
 * "Never use hex codes (e.g., #137fec) or RGB values directly in React components (.tsx) or inline styles.
 * Scanning the codebase for # followed by 6 hex digits outside of index.html or mockData should return 0 results."
 */

function getAllTsxFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;

  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'coverage' && file !== '.git') {
        getAllTsxFiles(fullPath, arrayOfFiles);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      // Exclude constants definition files where hex tokens are mapped (e.g. src/constants/assetClasses.ts, mockData.ts, tests)
      const relativePath = path.relative(process.cwd(), fullPath);
      if (
        !relativePath.startsWith('tests/') &&
        !relativePath.includes('mockData') &&
        !relativePath.includes('src/constants/') &&
        !relativePath.includes('vite.config') &&
        !relativePath.includes('vitest.config')
      ) {
        arrayOfFiles.push(relativePath);
      }
    }
  });

  return arrayOfFiles;
}

describe('Design Standard 1.1 — No Hardcoded Hex Color Codes in TSX Components', () => {
  it('should not contain any direct hex color strings in UI components or pages', () => {
    const directoriesToScan = ['components', 'pages', 'context', 'hooks', 'src'];
    const filesToScan: string[] = [];

    directoriesToScan.forEach((dir) => {
      getAllTsxFiles(path.join(process.cwd(), dir), filesToScan);
    });

    if (fs.existsSync(path.join(process.cwd(), 'App.tsx'))) {
      filesToScan.push('App.tsx');
    }

    const hexColorRegex = /#[0-9a-fA-F]{3,6}\b/g;
    const violations: { file: string; line: number; match: string; content: string }[] = [];

    filesToScan.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((lineText, lineIdx) => {
        // Ignore comments
        const cleanLine = lineText.trim();
        if (cleanLine.startsWith('//') || cleanLine.startsWith('/*') || cleanLine.startsWith('*')) {
          return;
        }

        const matches = lineText.match(hexColorRegex);
        if (matches) {
          matches.forEach((match) => {
            violations.push({
              file: filePath,
              line: lineIdx + 1,
              match,
              content: lineText.trim(),
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
        `Found ${violations.length} hardcoded hex color string(s) in TSX/TS components violating Section 1.1 of AI_CODING_STANDARDS.md:\n${violationSummary}\n\nUse CSS variables (e.g., var(--color-accent-blue)) or Tailwind semantic classes instead.`
      );
    } else {
      expect(violations.length).toBe(0);
    }
  });
});
