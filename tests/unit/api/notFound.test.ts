import { describe, it, expect } from 'vitest';
import handler from '../../../api/not-found.js';

const call = (): { status: number; headers: Record<string, string>; body: string } => {
  const headers: Record<string, string> = {};
  let body = '';
  const response = {
    statusCode: 200,
    setHeader: (name: string, value: string): void => { headers[name.toLowerCase()] = value; },
    end: (text: string): void => { body = text; },
  };
  handler({}, response);
  return { status: response.statusCode, headers, body };
};

describe('Markdown 404 for agents', () => {
  it('keeps the 404 status and answers in Markdown', () => {
    const { status, headers } = call();
    expect(status).toBe(404);
    expect(headers['content-type']).toMatch(/^text\/markdown/);
    expect(headers.vary).toBe('Accept');
  });

  it('explains the error in at least 20 characters and links the docs, the sitemap and llms.txt', () => {
    const { body } = call();
    expect(body).toMatch(/^# 404/);
    const explanation = body.split('\n').find((line) => /does not exist/.test(line)) ?? '';
    expect(explanation.length).toBeGreaterThanOrEqual(20);
    ['/en/docs', '/sitemap.xml', '/llms.txt'].forEach((path) => expect(body).toContain(`https://glassfolio.dev${path}`));
  });

  it('never echoes the requested address', () => {
    expect(call().body).not.toMatch(/\$\{|request/i);
  });
});
