/**
 * Optional override of the theme cookie domain from `VITE_THEME_COOKIE_DOMAIN`; `ThemeProvider` derives the registrable parent of the host by default,
 * so set it only for apps not on sibling subdomains. `VITE_*` is inlined at build time, so a value bakes one environment's domain into the image.
 * Read defensively: `import.meta.env` is absent in plain Node/SSR.
 */
export function themeCookieDomain(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_THEME_COOKIE_DOMAIN || undefined;
}
