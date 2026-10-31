import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const dockerfile = readFileSync(join(ROOT, 'docker', 'Dockerfile'), 'utf8');
const ignore = readFileSync(join(ROOT, 'docker', 'Dockerfile.dockerignore'), 'utf8');

/** Paths the Dockerfile copies from the build context (not from another stage). */
const copiedFromContext = (): string[] =>
  dockerfile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('COPY ') && !line.includes('--from='))
    .flatMap((line) => line.replace(/^COPY\s+/, '').split(/\s+/).slice(0, -1))
    .map((path) => path.replace(/^\.\//, '').replace(/\/$/, ''));

describe('Docker build context', () => {
  it('lets every path the Dockerfile copies into the build (the context is an allow-list)', () => {
    const allowed = new Set(ignore.split('\n').filter((line) => line.startsWith('!')).map((line) => line.slice(1)));
    const paths = copiedFromContext();
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(allowed.has(path), `${path} is copied by docker/Dockerfile but missing from docker/Dockerfile.dockerignore`).toBe(true);
    }
  });
});
