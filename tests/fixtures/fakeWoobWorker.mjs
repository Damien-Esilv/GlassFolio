// Fake Woob worker for tests/unit/server/woobBridge.test.ts: speaks the worker protocol on stdio.
import readline from 'node:readline';

const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const { id, cmd, params } = JSON.parse(line);
  const reply = (body) => process.stdout.write(`${JSON.stringify({ id, ...body })}\n`);
  if (cmd === 'status') return reply({ ok: true, result: { worker: 'fake', banks: ['boursorama'] } });
  if (params?.key === 'crash') process.exit(3);
  if (params?.key === 'slow') return undefined;
  if (params?.key === 'env') return reply({ ok: true, result: { env: Object.keys(process.env) } });
  if (params?.key === 'reauth') return reply({ ok: false, error: { code: 'reauth_required', message: '' } });
  return reply({ ok: true, result: { cmd, echo: params } });
});
