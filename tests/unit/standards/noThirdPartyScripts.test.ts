import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf-8');

describe('No third-party code in the HTML shell (E31 supply chain)', () => {
  it('loads no external script or stylesheet', () => {
    expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//i);
    expect(html).not.toMatch(/cdn\.tailwindcss\.com/i);
  });

  it('only runs the application entry module as an executable script', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((match) => match[1]);
    const executable = scripts.filter((attrs) => !/type=["']application\/ld\+json["']/i.test(attrs));
    expect(executable).toHaveLength(1);
    expect(executable[0]).toMatch(/type=["']module["']/);
    expect(executable[0]).toMatch(/src=["']\/src\/main\.tsx["']/);
  });

  it('compiles Tailwind at build time', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies.tailwindcss).toBeDefined();
    const config = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf-8');
    expect(config).toContain("darkMode: 'class'");
    expect(config).toContain("'./src/**/*.{ts,tsx}'");
  });
});
