/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface RenderBrand {
  /** Product wordmark shown in the header and footer. */
  name: string;
  /** Small uppercase label rendered beside the wordmark. */
  tagline: string;
  /** Accent colour (buttons, code block, wordmark dot) as a hex string. */
  accent: string;
  /** Accent colour used on dark backgrounds, kept legible against the dark surface. */
  accentDark: string;
}

/**
 * Declaring the constants
 */

/** The default first-party brand; mirrors the `@shadow-library/ui` indigo palette. A send may override any field via payload. */
export const DEFAULT_BRAND: RenderBrand = { name: 'Shadow', tagline: 'Security', accent: '#4f46e5', accentDark: '#818cf8' };

/**
 * The ambient variables every layout, template, and partial may reference without declaring them in a template's
 * variable schema — brand identity, the current year, and support coordinates. They are injected beneath the send
 * payload, so a caller can still override any of them (e.g. rendering for a different first-party product).
 */
export function buildRenderGlobals(): Record<string, unknown> {
  return {
    brand: DEFAULT_BRAND,
    year: new Date().getFullYear(),
    supportEmail: 'support@shadow.app',
    productUrl: 'https://shadow.app',
  };
}
