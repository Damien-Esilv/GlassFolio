import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Visual Theming Audit Test Suite
 * 
 * Enforces AI_CODING_STANDARDS.md Section 1:
 * - 1.1: Zero hardcoded hex colors, RGB/RGBA values in TSX/TS UI code
 * - 1.2: Zero raw Tailwind palette classes (e.g. text-emerald-500, bg-rose-500, text-amber-500)
 *        All components must use semantic tokens: positive, negative, warning, neutral, brand, accent-*
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
      if (
        !relativePath.startsWith('tests/') &&
        !relativePath.includes('.test.') &&
        !relativePath.includes('.spec.') &&
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

describe('Design Standards Audit — Visual Theming & Semantic Tokens', () => {
  const directoriesToScan = ['components', 'pages', 'context', 'hooks', 'src'];
  const filesToScan: string[] = [];

  directoriesToScan.forEach((dir) => {
    getAllSourceFiles(path.join(process.cwd(), dir), filesToScan);
  });

  if (fs.existsSync(path.join(process.cwd(), 'App.tsx'))) {
    filesToScan.push('App.tsx');
  }

  it('should not contain any raw Tailwind color palette classes (e.g. text-emerald-*, bg-rose-*)', () => {
    // Prohibited raw Tailwind color palette families with numeric steps (e.g., text-emerald-500, bg-amber-400)
    // Semantic tokens like text-positive, bg-negative, text-warning, text-accent-blue are required.
    const rawTailwindColorRegex = /\b(?:text|bg|border|ring|fill|stroke)-(?:emerald|rose|amber|yellow|lime|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g;

    const violations: { file: string; line: number; match: string; content: string }[] = [];

    filesToScan.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((lineText, lineIdx) => {
        const cleanLine = lineText.trim();
        // Ignore comment lines
        if (cleanLine.startsWith('//') || cleanLine.startsWith('/*') || cleanLine.startsWith('*')) {
          return;
        }

        const matches = lineText.match(rawTailwindColorRegex);
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
      const summary = violations
        .map((v) => `  - ${v.file}:${v.line} -> "${v.match}" in: "${v.content}"`)
        .join('\n');

      expect.fail(
        `Found ${violations.length} raw Tailwind color class(es) violating AI_CODING_STANDARDS.md Section 1.2:\n${summary}\n\nUse semantic classes: text-positive, text-negative, text-warning, text-accent-* or CSS variables.`
      );
    }

    expect(violations.length).toBe(0);
  });

  it('should not contain any direct rgba/rgb function literals in UI components', () => {
    // Prohibits raw rgba(...) or rgb(...) calls inside components/pages (outside of comments or CSS color-mix)
    const rgbRegex = /\brgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g;
    const violations: { file: string; line: number; match: string; content: string }[] = [];

    filesToScan.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((lineText, lineIdx) => {
        const cleanLine = lineText.trim();
        if (cleanLine.startsWith('//') || cleanLine.startsWith('/*') || cleanLine.startsWith('*')) {
          return;
        }

        const matches = lineText.match(rgbRegex);
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
      const summary = violations
        .map((v) => `  - ${v.file}:${v.line} -> "${v.match}" in: "${v.content}"`)
        .join('\n');

      expect.fail(
        `Found ${violations.length} hardcoded rgb/rgba literal(s) violating AI_CODING_STANDARDS.md Section 1.1:\n${summary}`
      );
    }

    expect(violations.length).toBe(0);
  });
});
