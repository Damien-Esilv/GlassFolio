import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_UPDATE_BYTES } from './constants.mjs';

export class DownloadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DownloadError';
    this.code = code;
  }
}

/**
 * Downloads `url` to `destination` and checks it against the size and SHA-512 announced by the signed manifest.
 * The file is deleted when anything does not match. `onProgress` receives a 0..1 ratio.
 * @param {{ url: string, destination: string, expectedSize: number, expectedSha512: string, fetchImpl?: typeof fetch, onProgress?: (ratio: number) => void, signal?: AbortSignal }} options
 * @returns {Promise<void>}
 */
export async function downloadVerified({ url, destination, expectedSize, expectedSha512, fetchImpl = fetch, onProgress, signal }) {
  if (!Number.isInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_UPDATE_BYTES) {
    throw new DownloadError('size', 'Unexpected file size');
  }
  const response = await fetchImpl(url, { redirect: 'follow', signal });
  if (!response.ok || !response.body) throw new DownloadError('network', `Download failed (${response.status})`);

  const hash = crypto.createHash('sha512');
  let received = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > expectedSize) {
        callback(new DownloadError('size', 'The file is larger than announced'));
        return;
      }
      hash.update(chunk);
      onProgress?.(received / expectedSize);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(destination, { mode: 0o600 }));
    if (received !== expectedSize) throw new DownloadError('size', 'The file is smaller than announced');
    if (hash.digest('hex') !== expectedSha512) throw new DownloadError('checksum', 'The file does not match its checksum');
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  }
}
