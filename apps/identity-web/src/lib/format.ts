/**
 * Presentation helpers for identity resources — relative/absolute time, device summaries, and the
 * small derived bits (initials, country flags) the screens render from lean API models.
 */

/** A compact relative time ("4m ago", "yesterday") from an ISO timestamp. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** An absolute, human timestamp ("12 Jul 2026, 14:05"). */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** A date without the clock time ("12 Jul 2026"). */
export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Up to two initials from a display name, for avatar fallbacks and monograms. */
export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A full name from first/last parts, falling back to the email local part or a generic label. */
export function displayName(user: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.email) return user.email.split('@')[0] ?? user.email;
  return 'User';
}

const BROWSERS: [RegExp, string][] = [
  [/edg/i, 'Edge'],
  [/opr|opera/i, 'Opera'],
  [/chrome|crios/i, 'Chrome'],
  [/firefox|fxios/i, 'Firefox'],
  [/safari/i, 'Safari'],
];

const PLATFORMS: [RegExp, string][] = [
  [/iphone|ipad|ipod/i, 'iOS'],
  [/android/i, 'Android'],
  [/mac os x|macintosh/i, 'macOS'],
  [/windows/i, 'Windows'],
  [/linux/i, 'Linux'],
];

/** A short "Chrome · macOS" summary from a session's device name or raw user-agent string. */
export function deviceSummary(session: { deviceName?: string | null; userAgent?: string | null }): string {
  if (session.deviceName?.trim()) return session.deviceName.trim();
  const ua = session.userAgent ?? '';
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const platform = PLATFORMS.find(([re]) => re.test(ua))?.[1];
  return [browser, platform].filter(Boolean).join(' · ') || 'Unknown device';
}

/** The regional-indicator emoji flag for a 2-letter ISO country code. */
export function countryFlag(code?: string | null): string {
  if (!code || code.length !== 2) return '';
  const base = 0x1f1e6;
  const chars = code
    .toUpperCase()
    .split('')
    .map(ch => base + (ch.charCodeAt(0) - 65));
  if (chars.some(cp => cp < base || cp > base + 25)) return '';
  return String.fromCodePoint(...chars);
}

/** "1 member" / "3 members" — count with a correctly pluralized noun. */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
