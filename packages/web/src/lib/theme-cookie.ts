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
 * The domain every Shadow app writes its theme cookie for, read from `VITE_THEME_COOKIE_DOMAIN`.
 *
 * The platform's apps are separate origins, so `localStorage` cannot carry a shared preference between them.
 * A cookie scoped to the registrable parent domain (`.shadow-apps.com`) can: it is visible to every app on a
 * subdomain of it, which is what makes a theme picked in one app the theme the next one opens with. Deploy
 * environments set the var; development leaves it unset, where a host-only cookie is already shared because
 * cookie scope ignores the port that distinguishes the local dev origins.
 *
 * `import.meta.env` is injected only by Vite-family bundlers, so it is read defensively — keeping this module
 * import-safe in a plain Node/SSR runtime where `import.meta.env` is absent.
 */
export function themeCookieDomain(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_THEME_COOKIE_DOMAIN || undefined;
}
