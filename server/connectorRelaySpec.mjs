/**
 * Allowlist of the connector relay (TGLA-221). The relay forwards a request only when its provider,
 * method, path and headers are listed here, so it can never be used as an open proxy.
 *
 * No user secret transits through these providers: SnapTrade requests are signed in the browser
 * (the consumer key never leaves it, only a one-time signature does), and the other providers
 * serve public market or blockchain data.
 */

const SNAPTRADE_ID = '[A-Za-z0-9-]{1,64}';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const FIGI_ID_TYPES = new Set(['ID_ISIN', 'TICKER', 'ID_BB_GLOBAL']);

/** OpenFIGI mapping jobs: at most 100 lookups of a known identifier type. */
const isFigiJobList = (body) =>
  Array.isArray(body) &&
  body.length > 0 &&
  body.length <= 100 &&
  body.every(
    (job) =>
      isPlainObject(job) &&
      FIGI_ID_TYPES.has(job.idType) &&
      typeof job.idValue === 'string' &&
      /^[A-Za-z0-9.]{1,32}$/.test(job.idValue) &&
      Object.keys(job).every((key) => ['idType', 'idValue', 'exchCode', 'currency', 'marketSecDes'].includes(key)),
  );

const SOLANA_METHODS = new Set(['getBalance', 'getTokenAccountsByOwner']);

const isSolanaCall = (call) =>
  isPlainObject(call) &&
  call.jsonrpc === '2.0' &&
  SOLANA_METHODS.has(call.method) &&
  Array.isArray(call.params) &&
  call.params.length <= 3 &&
  (typeof call.id === 'number' || typeof call.id === 'string');

/** Read-only Solana RPC calls (balances), alone or in a batch of at most 20. */
const isSolanaRpc = (body) =>
  isSolanaCall(body) || (Array.isArray(body) && body.length > 0 && body.length <= 20 && body.every(isSolanaCall));

export const RELAY_PROVIDERS = Object.freeze({
  snaptrade: {
    origin: 'https://api.snaptrade.com',
    forwardHeaders: ['signature'],
    routes: [
      {
        method: 'GET',
        // Endpoints are served from the host root; /api/v1 is SnapTrade's legacy prefix, accepted too
        path: new RegExp(
          `^(/api/v1)?/(accounts|accounts/all|accounts/${SNAPTRADE_ID}/(holdings|positions|positions/all|balances|activities)|activities|authorizations)$`,
        ),
      },
    ],
  },
  openfigi: {
    origin: 'https://api.openfigi.com',
    forwardHeaders: ['x-openfigi-apikey'],
    routes: [{ method: 'POST', path: /^\/v3\/mapping$/, body: isFigiJobList }],
  },
  solana: {
    origin: 'https://api.mainnet-beta.solana.com',
    forwardHeaders: [],
    routes: [{ method: 'POST', path: /^\/$/, body: isSolanaRpc }],
  },
  yahoo: {
    origin: 'https://query1.finance.yahoo.com',
    forwardHeaders: [],
    routes: [
      { method: 'GET', path: /^\/v1\/finance\/search$/ },
      { method: 'GET', path: /^\/v8\/finance\/chart\/[A-Za-z0-9.^=%_-]{1,64}$/ },
    ],
  },
});
