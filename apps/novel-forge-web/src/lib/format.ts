/**
 * Presentation helpers for backend resources.
 *
 * The API models are intentionally lean (no cover art, no display genre), so
 * the UI derives a few stable presentational bits from the data it does have.
 */
import { type ProjectModelRef, type ProjectResponse, type ProjectStatusResponse } from '@/lib/apis';

// A role's model override is a `{ provider, model }` pair, but a `Select` needs a single string value,
// so the two are joined on '::'. A model id never contains '::', so the split back is unambiguous.
export function encodeModelRef(provider: string, model: string): string {
  return `${provider}::${model}`;
}

export function decodeModelRef(value: string): ProjectModelRef {
  const i = value.indexOf('::');
  return { provider: value.slice(0, i), model: value.slice(i + 2) };
}

/** A compact relative time ("4m ago", "yesterday") from an ISO timestamp. */
export function relativeTime(iso: string): string {
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

/**
 * A compact absolute timestamp for a chat message — clock time for today, date + clock time otherwise
 * (dropping the year unless it differs from now). Complements `relativeTime`, which reads better for
 * lists but hides the wall-clock time a transcript wants.
 */
export function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return time;
  const day = date.toLocaleDateString(
    undefined,
    date.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' },
  );
  return `${day}, ${time}`;
}

/** A deterministic, pleasant cover colour derived from an id — stable per project. */
export function coverColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 42% 32%)`;
}

/**
 * Origin that serves object-storage bytes anonymously (`<origin>/<ref>`), read from
 * `VITE_STORAGE_PUBLIC_ORIGIN`. The server stores content-addressed refs (`<sha256hex>.<ext>`) and the
 * bytes live in the platform's public bucket (Garage's website endpoint), not behind the forge API, so
 * the browser builds the absolute URL itself. `import.meta.env` is read defensively — it is injected only
 * by Vite-family bundlers, keeping this module import-safe under a plain Node/SSR runtime. The dev default
 * mirrors the server module's `storage.public-origin` default.
 */
const STORAGE_PUBLIC_ORIGIN = (
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_STORAGE_PUBLIC_ORIGIN || 'http://localhost:8080/local-storage'
).replace(/\/+$/, '');

/** Resolve a storage ref (e.g. `a1b2…f0.png`) to its anonymous public URL; null passes through. */
export function imageUrl(ref?: string | null): string | undefined {
  return ref ? `${STORAGE_PUBLIC_ORIGIN}/${ref}` : undefined;
}

/** The best human title for a project — its explicit title, falling back to its name. */
export function projectTitle(project: Pick<ProjectResponse, 'name' | 'title'>): string {
  return project.title?.trim() || project.name;
}

const kindLabels: Record<ProjectResponse['kind'], string> = {
  new_novel: 'Original novel',
  source: 'Adapted from source',
};

export function projectKindLabel(kind: ProjectResponse['kind']): string {
  return kindLabels[kind] ?? kind;
}

/** The short, lowercase kind label used in the coloured chips (e.g. `source`, `new-novel`). */
export function projectKindTag(kind: ProjectResponse['kind']): string {
  return kind === 'source' ? 'source' : 'new-novel';
}

/** A stable accent colour (a `--sh-*` token) for a project's rail dot and card stripe. */
export function projectDotColor(project: Pick<ProjectResponse, 'kind'>): string {
  return project.kind === 'source' ? 'var(--sh-indigo-400)' : 'var(--sh-green-400)';
}

export const LIFECYCLE_PHASES = ['Bible', 'Plan', 'Arcs', 'Drafts', 'Review'] as const;

export interface LifecyclePhase {
  /** Number of phases completed (0…5). */
  completed: number;
  total: number;
  /** The phase the project is currently in. */
  label: string;
}

/**
 * Derive a monotonic lifecycle position from a project's status. The phases run
 * Bible → Plan → Arcs → Drafts → Review; a phase counts as complete
 * only when every earlier phase is too, so the sidebar bar never regresses.
 */
export function lifecyclePhase(status?: ProjectStatusResponse): LifecyclePhase {
  const total = LIFECYCLE_PHASES.length;
  if (!status) return { completed: 0, total, label: LIFECYCLE_PHASES[0] };
  const draftsTotal = status.draftsTotal ?? 0;
  const draftsFinal = status.draftsFinal ?? 0;
  const flags = [true, (status.volumesTotal ?? 0) > 0, status.planApproved === true, draftsTotal > 0, draftsTotal > 0 && draftsFinal === draftsTotal];
  let completed = 0;
  for (const ok of flags) {
    if (!ok) break;
    completed++;
  }
  return { completed, total, label: LIFECYCLE_PHASES[Math.min(completed, total - 1)] ?? LIFECYCLE_PHASES[0] };
}
