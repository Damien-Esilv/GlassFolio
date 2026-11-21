const SEMVER = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,64}))?(?:\+[0-9A-Za-z.-]+)?$/;

/** @returns {{ core: number[], pre: string[] } | null} */
export function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = SEMVER.exec(value.trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] };
}

const comparePrerelease = (a, b) => {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1; // a release outranks its own pre-releases
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const numericA = /^\d+$/.test(a[i]);
    const numericB = /^\d+$/.test(b[i]);
    if (numericA && numericB) {
      const diff = Number(a[i]) - Number(b[i]);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (numericA !== numericB) {
      return numericA ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] > b[i] ? 1 : -1;
    }
  }
  return 0;
};

/** @returns {number | null} 1, 0 or -1; null when a version is not valid semver */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left.core[i] !== right.core[i]) return left.core[i] > right.core[i] ? 1 : -1;
  }
  return comparePrerelease(left.pre, right.pre);
}

export const isNewerVersion = (candidate, current) => compareVersions(candidate, current) === 1;
