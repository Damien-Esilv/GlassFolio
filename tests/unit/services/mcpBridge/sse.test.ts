import { describe, it, expect } from 'vitest';
import { readSse, type SseEvent } from '../../../../src/services/mcpBridge/sse';

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
const read = async (...chunks: string[]): Promise<SseEvent[]> => {
  const events: SseEvent[] = [];
  await readSse(streamOf(...chunks), (event) => events.push(event));
  return events;
};

describe('Server-Sent Events reader', () => {
  it('reads named events with their data', async () => {
    expect(await read('event: hello\ndata: {"a":1}\n\nevent: call\ndata: {"b":2}\n\n')).toEqual([
      { event: 'hello', data: '{"a":1}' },
      { event: 'call', data: '{"b":2}' },
    ]);
  });

  it('puts together an event that arrives in several chunks, even inside a character', async () => {
    const bytes = new TextEncoder().encode('event: x\ndata: é\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 13));
        controller.enqueue(bytes.slice(13));
        controller.close();
      },
    });
    const events: SseEvent[] = [];
    await readSse(stream, (event) => events.push(event));
    expect(events).toEqual([{ event: 'x', data: 'é' }]);
  });

  it('ignores keep-alive comments, accepts CRLF, joins data lines and defaults the event name', async () => {
    expect(await read(': keepalive\n\n')).toEqual([]);
    expect(await read('event: a\r\ndata: 1\r\n\r\n')).toEqual([{ event: 'a', data: '1' }]);
    expect(await read('data: one\ndata: two\n\n')).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('drops an event that never ended', async () => {
    expect(await read('event: a\ndata: 1')).toEqual([]);
  });
});
