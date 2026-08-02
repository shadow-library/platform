/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Novel Forge — the platform's authoring studio — is a separate first-party deployment, so every "write a
 * novel" affordance is a real external link rather than SPA navigation, and its host differs per environment
 * (`novel-forge.shadow-apps.test` in the dev cluster, `novel-forge.shadow-apps.com` in production). It is read
 * from `VITE_NOVEL_FORGE_URL` and defaults to production. `import.meta.env` is read defensively — it is
 * injected only by Vite-family bundlers, keeping this module import-safe under a plain Node/SSR runtime.
 */
export const NOVEL_FORGE_URL = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_NOVEL_FORGE_URL || 'https://novel-forge.shadow-apps.com'
).replace(/\/+$/, '');
