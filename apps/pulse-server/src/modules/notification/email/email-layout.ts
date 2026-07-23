/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface EmailBrand {
  /** Product wordmark shown in the header and footer. */
  name: string;
  /** Small uppercase label rendered beside the wordmark. */
  tagline: string;
  /** Accent colour (buttons, code block, wordmark dot) as a hex string. */
  accent: string;
  /** Accent colour used on dark backgrounds, kept legible against the dark surface. */
  accentDark: string;
}

export interface EmailDocumentOptions {
  /** The Mustache-rendered content fragment for this template — semantic HTML using the `email-*` classes. */
  contentHtml: string;
  /** Inbox preview text; shown by clients after the subject and otherwise hidden. */
  preheader?: string;
  /** Overrides the default Shadow branding — pulse renders for many first-party apps. */
  brand?: EmailBrand;
}

/**
 * Declaring the constants
 *
 * Design tokens mirror the `@shadow-library/ui` palette (indigo accent, the neutral ramp) so
 * transactional email reads as one system with the product UI. Values are inlined rather than
 * referenced as CSS custom properties because custom properties are unreliable across email clients
 * (Outlook desktop, older Gmail); the `@media (prefers-color-scheme: dark)` block is the theme switch.
 */
const DEFAULT_BRAND: EmailBrand = { name: 'Shadow', tagline: 'Account security', accent: '#4f46e5', accentDark: '#818cf8' };

/** Kept short and generic — it wraps every transactional email, not just security alerts. */
const FOOTER_NOTE = 'This is an automated message from Shadow. For your security, we never ask for your password or codes by email.';

const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Wraps a rendered content fragment in the branded, theme-aware Shadow email shell. The fragment is
 * expected to be trusted HTML (authored in the template catalogue, with variables already
 * interpolated); only the caller-supplied preheader is escaped. The whole document is self-contained
 * — no external assets — so it renders identically offline and passes strict email content policies.
 */
export const renderEmailDocument = (options: EmailDocumentOptions): string => {
  const brand = options.brand ?? DEFAULT_BRAND;
  const preheader = options.preheader ? escapeHtml(options.preheader) : '';
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<style>
  body { margin: 0; padding: 0; width: 100%; background: #f4f5f7; -webkit-text-size-adjust: 100%; }
  .email-wrap { width: 100%; background: #f4f5f7; padding: 32px 12px; }
  .email-card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e7ec; border-radius: 14px; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .email-header { padding: 24px 32px; border-bottom: 1px solid #eef0f4; }
  .email-brand { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: #101828; }
  .email-brand-dot { color: ${brand.accent}; }
  .email-tagline { display: inline-block; margin-left: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #98a2b3; }
  .email-body { padding: 32px; }
  .email-h1 { margin: 0 0 16px; font-size: 22px; line-height: 1.3; font-weight: 700; color: #101828; letter-spacing: -0.01em; }
  .email-text { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #475467; }
  .email-muted { margin: 16px 0 0; font-size: 13px; line-height: 1.6; color: #98a2b3; }
  .email-strong { color: #101828; font-weight: 600; }
  .email-code { margin: 24px 0; padding: 20px; text-align: center; background: #f8f9fc; border: 1px solid #e4e7ec; border-radius: 12px;
    font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace; font-size: 32px; font-weight: 700; letter-spacing: 0.35em; color: ${brand.accent}; }
  .email-btn { display: inline-block; margin: 8px 0 4px; padding: 12px 28px; background: ${brand.accent}; color: #ffffff !important;
    font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; }
  .email-panel { margin: 24px 0; padding: 16px 18px; background: #f8f9fc; border: 1px solid #e4e7ec; border-left: 3px solid ${brand.accent}; border-radius: 8px;
    font-size: 14px; line-height: 1.6; color: #475467; }
  .email-panel--warn { background: #fff8eb; border-color: #f2d18b; border-left-color: #dc9a1e; color: #7a4d00; }
  .email-meta { width: 100%; margin: 20px 0; border-collapse: collapse; font-size: 14px; }
  .email-meta td { padding: 8px 0; border-bottom: 1px solid #eef0f4; color: #475467; vertical-align: top; }
  .email-meta .email-meta-label { color: #98a2b3; width: 40%; }
  .email-footer { padding: 20px 32px 28px; border-top: 1px solid #eef0f4; }
  .email-footer-note { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: #98a2b3; }
  .email-footer-legal { margin: 0; font-size: 12px; color: #b6bdc9; }
  @media (prefers-color-scheme: dark) {
    body, .email-wrap { background: #0b0d12 !important; }
    .email-card { background: #14171f !important; border-color: #262b36 !important; }
    .email-header, .email-footer { border-color: #222732 !important; }
    .email-brand, .email-h1, .email-strong { color: #f5f7fa !important; }
    .email-brand-dot { color: ${brand.accentDark} !important; }
    .email-text, .email-panel, .email-meta td { color: #c3c9d4 !important; }
    .email-muted, .email-tagline, .email-footer-note, .email-meta .email-meta-label { color: #8b93a4 !important; }
    .email-footer-legal { color: #6b7280 !important; }
    .email-code, .email-panel { background: #1b1f29 !important; border-color: #2b313d !important; }
    .email-code { color: ${brand.accentDark} !important; }
    .email-panel { border-left-color: ${brand.accentDark} !important; }
    .email-panel--warn { background: #2a2213 !important; border-color: #5c4a1c !important; border-left-color: #d8a63b !important; color: #f2c879 !important; }
    .email-btn { background: ${brand.accentDark} !important; color: #0b0d12 !important; }
    .email-meta td { border-color: #222732 !important; }
  }
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<div class="email-wrap">
  <div class="email-card">
    <div class="email-header">
      <span class="email-brand">${escapeHtml(brand.name)}<span class="email-brand-dot">.</span></span>
      <span class="email-tagline">${escapeHtml(brand.tagline)}</span>
    </div>
    <div class="email-body">
${options.contentHtml}
    </div>
    <div class="email-footer">
      <p class="email-footer-note">${FOOTER_NOTE}</p>
      <p class="email-footer-legal">&copy; ${year} ${escapeHtml(brand.name)}. All rights reserved.</p>
    </div>
  </div>
</div>
</body>
</html>`;
};
