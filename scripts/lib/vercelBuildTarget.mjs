/** The two Vercel projects (same repository, same vercel.json) and the build each one serves. */
const TARGET_BY_PROJECT = {
  prj_zenxmm6RkErum42sENa2uQEzVTGw: 'showcase',
  prj_iTAiILjVqmtUCOLIpasFB8szrZfN: 'app',
};

/**
 * @param {Record<string, string | undefined>} env
 * @returns {'showcase' | 'app'}
 */
export function resolveVercelBuildTarget(env) {
  const target = env.GLASSFOLIO_BUILD_TARGET ?? TARGET_BY_PROJECT[env.VERCEL_PROJECT_ID ?? ''];
  if (target !== 'showcase' && target !== 'app') {
    throw new Error(`Unknown Vercel project "${env.VERCEL_PROJECT_ID}": add it to TARGET_BY_PROJECT or set GLASSFOLIO_BUILD_TARGET`);
  }
  return target;
}
