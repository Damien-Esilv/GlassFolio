/**
 * Public half (ed25519, SPKI DER, base64) of the key that signs `update-manifest.json` in the release workflow.
 *
 * Generated with `npm --prefix desktop run generate-update-key`; the private half is the GitHub secret `UPDATE_SIGNING_KEY`.
 * If this value is ever empty the app never checks for updates (it cannot verify anything) and the release workflow
 * refuses to publish. Replacing it means shipping a new app version: installed apps only trust the key they were built with.
 */
export const UPDATE_PUBLIC_KEY_BASE64 = 'MCowBQYDK2VwAyEAODA5iUdDrxoWtgb4IFmo+yjZbaD5Z8eKd+h47RG55ac=';
