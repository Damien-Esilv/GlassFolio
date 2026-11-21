/**
 * Public half (ed25519, SPKI DER, base64) of the key that signs `update-manifest.json` in the release workflow.
 *
 * Empty until the maintainer runs `npm --prefix desktop run generate-update-key`, commits the printed value here
 * and stores the private key as the GitHub secret `UPDATE_SIGNING_KEY`. While it is empty the app never checks for
 * updates (it cannot verify anything), and the release workflow refuses to publish.
 */
export const UPDATE_PUBLIC_KEY_BASE64 = '';
