/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  /** `'any'`, `'maskable'`, `'monochrome'`, or a space-separated combination. */
  purpose?: string;
}

export interface ManifestShortcut {
  name: string;
  url: string;
  short_name?: string;
  description?: string;
  icons?: ManifestIcon[];
}

/** The subset of the Web App Manifest spec apps commonly set; extra keys are allowed via the index signature. */
export interface WebAppManifest {
  name?: string;
  short_name?: string;
  description?: string;
  id?: string;
  start_url?: string;
  scope?: string;
  display?: 'fullscreen' | 'standalone' | 'minimal-ui' | 'browser';
  orientation?: 'any' | 'natural' | 'portrait' | 'landscape' | 'portrait-primary' | 'landscape-primary';
  background_color?: string;
  theme_color?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  categories?: string[];
  icons?: ManifestIcon[];
  shortcuts?: ManifestShortcut[];
  [key: string]: unknown;
}

export interface BuildManifestInput extends Omit<WebAppManifest, 'name'> {
  name: string;
}

export interface PwaHeadOptions {
  /** URL the `<link rel="manifest">` points at. @default '/manifest.webmanifest' */
  manifestUrl?: string;
  /** `theme-color` meta value (browser UI tint). */
  themeColor?: string;
  /** iOS home-screen icon (`apple-touch-icon`) — iOS ignores the manifest `icons` for this. */
  appleTouchIcon?: string;
  /** iOS standalone title (`apple-mobile-web-app-title`). */
  appleTitle?: string;
}

export interface HeadLink {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
}

export interface HeadMeta {
  name: string;
  content: string;
}

/**
 * Declaring the constants
 */
const MANIFEST_DEFAULTS = { start_url: '/', scope: '/', display: 'standalone' } as const satisfies Partial<WebAppManifest>;

/**
 * Build a Web App Manifest object from an app's values layered over sensible defaults (`start_url`/`scope` of
 * `/`, `standalone` display, `short_name` falling back to `name`). Serve the result at a stable URL with
 * {@link manifestResponse}, or write it to `public/manifest.webmanifest` at build time.
 */
export function buildManifest(input: BuildManifestInput): WebAppManifest {
  return { ...MANIFEST_DEFAULTS, short_name: input.name, ...input };
}

/** Wrap a manifest in a `Response` with the correct `application/manifest+json` type — for a server route. */
export function manifestResponse(manifest: WebAppManifest, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600', ...headers } });
}

/**
 * The `<link>` descriptors a PWA needs in `<head>` — the manifest link plus an optional iOS home-screen icon.
 * Returned as plain objects so they drop straight into any head manager (TanStack Start's `head.links`, a raw
 * `<link>`, etc.) without coupling this package to a framework.
 */
export function pwaHeadLinks(options: PwaHeadOptions = {}): HeadLink[] {
  const links: HeadLink[] = [{ rel: 'manifest', href: options.manifestUrl ?? '/manifest.webmanifest' }];
  if (options.appleTouchIcon) links.push({ rel: 'apple-touch-icon', href: options.appleTouchIcon });
  return links;
}

/** The `<meta>` descriptors a PWA needs in `<head>` — installability hints and the theme color. */
export function pwaHeadMeta(options: PwaHeadOptions = {}): HeadMeta[] {
  const meta: HeadMeta[] = [
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
  ];
  if (options.themeColor) meta.push({ name: 'theme-color', content: options.themeColor });
  if (options.appleTitle) meta.push({ name: 'apple-mobile-web-app-title', content: options.appleTitle });
  return meta;
}
