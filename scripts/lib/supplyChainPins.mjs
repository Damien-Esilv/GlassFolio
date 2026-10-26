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
