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
 * An explicit override for the theme cookie's domain, read from `VITE_THEME_COOKIE_DOMAIN`.
 *
 * **Optional, and normally unset.** `ThemeProvider` derives the registrable parent of the current host on its
 * own (`identity.shadow-apps.com` → `.shadow-apps.com`), which is what lets a theme picked in one app be the
 * theme the next one opens with. Pass this only where that derivation is wrong — apps that do not sit on
 * sibling subdomains of one parent.
 *
 * Reach for it reluctantly: `VITE_*` is inlined at **build time**, so a value here bakes one environment's
 * domain into the image and needs a separate build per environment. Omitting it once already shipped four
 * images that each wrote a host-only cookie, silently confining the theme to one app.
 *
 * `import.meta.env` is injected only by Vite-family bundlers, so it is read defensively — keeping this module
 * import-safe in a plain Node/SSR runtime where `import.meta.env` is absent.
 */
export function themeCookieDomain(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_THEME_COOKIE_DOMAIN || undefined;
}
