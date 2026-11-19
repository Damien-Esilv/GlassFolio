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

/** Default host port in local / Docker self-hosted mode (`GLASSFOLIO_PORT`). */
export const SELF_HOST_DEFAULT_PORT = '3780';

/** Address the container answers on with the default `docker/docker.env`. */
export const SELF_HOST_DEFAULT_URL = `http://localhost:${SELF_HOST_DEFAULT_PORT}`;

/** Default port of the standalone MCP bridge (`glassfolio-mcp serve` / `GLASSFOLIO_MCP_PORT`). */
export const MCP_BRIDGE_DEFAULT_PORT = '47831';

/** Address the standalone MCP bridge listens on by default. */
export const STANDALONE_BRIDGE_DEFAULT_URL = `http://127.0.0.1:${MCP_BRIDGE_DEFAULT_PORT}`;

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
