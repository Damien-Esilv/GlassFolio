/**
 * project.ts
 *
 * Public project coordinates used by the showcase and the self-hosting guide.
 * Single source of truth for the GitHub repository and the Docker quick start.
 */

import { getAppTarget } from './deployment';

/** Maintainer profile (also cited in the legal notice). */
export const GITHUB_PROFILE_URL = 'https://github.com/Damien-Esilv';

export const GITHUB_REPO_URL = `${GITHUB_PROFILE_URL}/GlassFolio`;

/** README section that documents Docker self-hosting (GitHub heading anchor). */
export const GITHUB_README_DOCKER_URL = `${GITHUB_REPO_URL}#-self-hosting-with-docker`;

export const GITHUB_LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`;

/** Address the container answers on with the default `docker/docker.env`. */
export const SELF_HOST_DEFAULT_URL = 'http://localhost:3000';

/** Commands, in order, that bring up the self-hosted app (`docker:up` runs the network guard). */
export const DOCKER_QUICKSTART_COMMANDS: readonly string[] = [
  `git clone ${GITHUB_REPO_URL}.git`,
  'cd GlassFolio',
  'npm run docker:up',
];

/**
 * Path of a public page inside the current build: the showcase build serves it at the root,
 * the unified build (dev / single deploy) under `/welcome`.
 */
export function buildPublicPagePath(path: string): string {
  return getAppTarget() === 'showcase' ? path : `/welcome${path}`;
}
