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

export interface RecencyGroup<T> {
  label: string;
  items: T[];
}

// Local calendar date reduced to a single UTC-anchored integer: `Date.UTC` here isn't claiming these
// components are UTC, it's just the cheapest way to collapse a local Y/M/D into one comparable number
// per day, independent of time-of-day and DST.
function dayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function recencyLabel(date: Date, now: Date): string {
  const dayDiff = dayIndex(now) - dayIndex(date);
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return 'Previous 7 days';
  if (dayDiff < 30) return 'Previous 30 days';
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
}

/**
 * Groups items into recency buckets — Today, Yesterday, Previous 7 days, Previous 30 days, then by
 * month (with year once it's not `now`'s) — newest first. Sorts by `recencyOf` before bucketing, since
 * a caller's own list order may track a different field than the one buckets are computed from; a
 * dayDiff of zero or less (today, or a clock-skewed future timestamp) always lands in "Today" rather
 * than an out-of-range bucket. A bucket is only emitted when it holds at least one item.
 */
export function groupByRecency<T>(items: T[], recencyOf: (item: T) => string, now: Date = new Date()): RecencyGroup<T>[] {
  const sorted = [...items].sort((a, b) => new Date(recencyOf(b)).getTime() - new Date(recencyOf(a)).getTime());
  const groups: RecencyGroup<T>[] = [];
  for (const item of sorted) {
    const parsed = new Date(recencyOf(item));
    const label = recencyLabel(Number.isNaN(parsed.getTime()) ? now : parsed, now);
    const current = groups.at(-1);
    if (current?.label === label) current.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export function coverColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 42% 32%)`;
}

export function projectTitle(project: Pick<ProjectResponse, 'name' | 'title'>): string {
  return project.title?.trim() || project.name;
}

const kindLabels: Partial<Record<ProjectResponse['kind'], string>> = {
  new_novel: 'Original novel',
};

export function projectKindLabel(kind: ProjectResponse['kind']): string {
  return kindLabels[kind] ?? kind;
}

const kindTags: Partial<Record<ProjectResponse['kind'], string>> = {
  new_novel: 'new-novel',
};

export function projectKindTag(kind: ProjectResponse['kind']): string {
  return kindTags[kind] ?? kind;
}

/** Chip intent for a project kind — always accent now that `new_novel` is the only one. */
export function projectKindIntent(_kind: ProjectResponse['kind']): 'accent' | 'info' | 'success' | 'warning' {
  return 'accent';
}

const kindDotColors: Partial<Record<ProjectResponse['kind'], string>> = {
  new_novel: 'var(--sh-green-400)',
};

export function projectDotColor(project: Pick<ProjectResponse, 'kind'>): string {
  return kindDotColors[project.kind] ?? 'var(--sh-green-400)';
}

// `sharedWithOrg` is never true for a project the caller created — projectOwnerColumns sets it only for a
// bot — so it alone marks "not created here", even after a bot-ownership transfer leaves it on a user-owned row.
export function sharedOwnerLabel(project: Pick<ProjectResponse, 'ownerKind' | 'sharedWithOrg'>): string | null {
  if (!project.sharedWithOrg) return null;
  return project.ownerKind === 'bot' ? 'Bot-owned · shared with your organisation' : 'Shared with your organisation';
}

/** Short form of `sharedOwnerLabel` for space-constrained captions (the project switcher). */
export function sharedOwnerTag(project: Pick<ProjectResponse, 'ownerKind' | 'sharedWithOrg'>): string | null {
  if (!project.sharedWithOrg) return null;
  return project.ownerKind === 'bot' ? 'Bot-owned' : 'Shared';
}

/** Sidebar lifecycle labels for the one project workflow this app now has. */
export const LIFECYCLE_PHASES: Partial<Record<ProjectResponse['kind'], readonly string[]>> = {
  new_novel: ['Bible', 'Plan', 'Arcs', 'Drafts', 'Review'],
};

export interface LifecyclePhase {
  completed: number;
  total: number;
  label: string;
}

/**
 * Derive a monotonic lifecycle position from a project's status. `kind` defaults to `status?.kind`, then
 * `new_novel`, but a caller that already knows the kind (from the project itself, which loads before its
 * status) should pass it explicitly so the shell and the overview screen agree on `total`/hiding from the
 * first paint, instead of waiting on `status` to arrive. Bible → Plan → Arcs → Drafts → Review; a phase
 * counts as complete only when every earlier phase is too, so the bar never regresses.
 */
export function lifecyclePhase(status?: ProjectStatusResponse, kind: ProjectResponse['kind'] = status?.kind ?? 'new_novel'): LifecyclePhase {
  const phases = LIFECYCLE_PHASES[kind] ?? [];
  const total = phases.length;
  if (total === 0 || !status) return { completed: 0, total, label: phases[0] ?? '' };
  const draftsTotal = status.draftsTotal ?? 0;
  const draftsFinal = status.draftsFinal ?? 0;
  const flags = [true, (status.volumesTotal ?? 0) > 0, status.planApproved === true, draftsTotal > 0, draftsTotal > 0 && draftsFinal === draftsTotal];
  let completed = 0;
  for (const ok of flags) {
    if (!ok) break;
    completed++;
  }
  return { completed, total, label: phases[Math.min(completed, total - 1)] ?? phases[0] ?? '' };
}

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
