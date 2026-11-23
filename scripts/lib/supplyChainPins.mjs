/** Pure checks that build-time dependencies are pinned by content hash (Epic E31). */

const DIGEST = /@sha256:[0-9a-f]{64}$/;
const COMMIT_SHA = /@[0-9a-f]{40}$/;

/** Image references of `FROM` lines that are not pinned by digest (stage aliases and scratch are exempt). */
export const findUnpinnedDockerBases = (dockerfileText) => {
  const stages = new Set();
  const unpinned = [];
  // The `# syntax=` directive pulls a BuildKit frontend image: it must be pinned as well.
  const syntax = dockerfileText.match(/^#\s*syntax\s*=\s*(\S+)/im);
  if (syntax && !DIGEST.test(syntax[1])) unpinned.push(syntax[1]);
  for (const line of dockerfileText.split('\n')) {
    const match = line.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i);
    if (!match) continue;
    const [, image, alias] = match;
    if (image.toLowerCase() !== 'scratch' && !stages.has(image) && !DIGEST.test(image)) unpinned.push(image);
    if (alias) stages.add(alias);
  }
  return unpinned;
};

/** `uses:` references that are not pinned to a full commit SHA (local `./` actions are exempt). */
export const findUnpinnedActions = (workflowText) => {
  const unpinned = [];
  for (const line of workflowText.split('\n')) {
    const match = line.match(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/);
    if (!match) continue;
    const ref = match[1];
    if (ref.startsWith('./')) continue;
    if (!COMMIT_SHA.test(ref)) unpinned.push(ref);
  }
  return unpinned;
};

/**
 * Requirements of a pip lock file (`uv pip compile --generate-hashes`) without a `--hash=sha256:` (TGLA-239):
 * `pip install --require-hashes` would refuse them anyway, this catches a lock edited by hand.
 */
export const findUnhashedPythonRequirements = (lockText) => {
  const unhashed = [];
  const blocks = lockText.split(/\n(?=\S)/);
  for (const block of blocks) {
    const first = block.split('\n')[0].trim();
    if (!first || first.startsWith('#') || first.startsWith('-')) continue;
    const name = first.split(/[\s=;\\]/)[0];
    if (!/==/.test(first) || !/--hash=sha256:[0-9a-f]{64}/.test(block)) unhashed.push(name);
  }
  return unhashed;
};

/** Downloads of the desktop Woob runtime (desktop/woob-runtime.json) not pinned to an https URL and a SHA-256. */
export const findUnpinnedRuntimeArchives = (manifest) =>
  Object.entries(manifest?.targets ?? {})
    .filter(([, target]) => !/^https:\/\//.test(target?.url ?? '') || !/^[0-9a-f]{64}$/.test(target?.sha256 ?? ''))
    .map(([name]) => name);

