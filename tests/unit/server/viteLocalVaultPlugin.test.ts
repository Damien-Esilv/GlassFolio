import { describe, it, expect, afterEach } from 'vitest';
import { localVaultPlugin } from '../../../server/viteLocalVaultPlugin.mjs';

const ENV_KEYS = ['GLASSFOLIO_DEV_HOST', 'GLASSFOLIO_PREVIEW_HOST', 'GLASSFOLIO_ACCESS_TOKEN', 'ACCESS_TOKEN', 'VITE_DEPLOYMENT_MODE'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const start = () => {
    const server = { middlewares: { use: () => undefined } };
    (localVaultPlugin() as { configureServer: (s: unknown) => void }).configureServer(server);
};

describe('vite dev/preview vault API exposure guard', () => {
    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    it('starts on loopback (the default) without a token', () => {
        delete process.env.GLASSFOLIO_DEV_HOST;
        delete process.env.GLASSFOLIO_ACCESS_TOKEN;
        expect(start).not.toThrow();
        process.env.GLASSFOLIO_DEV_HOST = '127.0.0.1';
        expect(start).not.toThrow();
    });

    it('refuses to start on a network interface without an access token', () => {
        delete process.env.GLASSFOLIO_ACCESS_TOKEN;
        delete process.env.ACCESS_TOKEN;
        process.env.GLASSFOLIO_DEV_HOST = '0.0.0.0';
        expect(start).toThrow(/GLASSFOLIO_ACCESS_TOKEN/);
        delete process.env.GLASSFOLIO_DEV_HOST;
        process.env.GLASSFOLIO_PREVIEW_HOST = '0.0.0.0';
        expect(start).toThrow(/GLASSFOLIO_ACCESS_TOKEN/);
    });

    it('allows a network interface when a long enough token protects the API', () => {
        process.env.GLASSFOLIO_DEV_HOST = '0.0.0.0';
        process.env.GLASSFOLIO_ACCESS_TOKEN = 'a-long-enough-dev-token-1234';
        expect(start).not.toThrow();
    });
});

describe('server/ is self-contained (the Docker image copies server/ but not scripts/)', () => {
    it('never imports a relative path outside server/', async () => {
        const { readdirSync, readFileSync } = await import('node:fs');
        const { join, resolve, sep } = await import('node:path');
        const dir = resolve(__dirname, '../../../server');
        const offenders: string[] = [];
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
            const source = readFileSync(join(dir, file), 'utf8');
            for (const match of source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
                const target = resolve(dir, match[1]);
                if (!target.startsWith(dir + sep)) offenders.push(`${file} -> ${match[1]}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
