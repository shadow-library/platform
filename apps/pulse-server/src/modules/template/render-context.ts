interface RenderBrand {
  name: string;
  tagline: string;
  accent: string;
  accentDark: string;
}

const DEFAULT_BRAND: RenderBrand = { name: 'Shadow', tagline: 'Security', accent: '#4f46e5', accentDark: '#818cf8' };

/** Ambient variables templates may reference without declaring them; the send payload is spread over them, so a caller can override any. */
export function buildRenderGlobals(): Record<string, unknown> {
  return {
    brand: DEFAULT_BRAND,
    year: new Date().getFullYear(),
    supportEmail: 'support@shadow.app',
    productUrl: 'https://shadow.app',
  };
}

/** Payload keys that would replace framework-rendered values: the globals and the layout's `content` slot. */
export const RENDER_GLOBAL_KEYS: ReadonlySet<string> = new Set([...Object.keys(buildRenderGlobals()), 'content']);
