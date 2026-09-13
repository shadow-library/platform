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

export function coverColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 42% 32%)`;
}

export function projectTitle(project: Pick<ProjectResponse, 'name' | 'title'>): string {
  return project.title?.trim() || project.name;
}

const kindLabels: Record<ProjectResponse['kind'], string> = {
  new_novel: 'Original novel',
  source: 'Adapted from source',
  translation: 'Translated novel',
  curated: 'Curated novel',
};

export function projectKindLabel(kind: ProjectResponse['kind']): string {
  return kindLabels[kind] ?? kind;
}

const kindTags: Record<ProjectResponse['kind'], string> = {
  new_novel: 'new-novel',
  source: 'source',
  translation: 'translation',
  curated: 'curated',
};

export function projectKindTag(kind: ProjectResponse['kind']): string {
  return kindTags[kind] ?? kind;
}

/** Chip intent per workflow, matching the design mockup's tag colours. */
export function projectKindIntent(kind: ProjectResponse['kind']): 'accent' | 'info' | 'success' | 'warning' {
  if (kind === 'source') return 'info';
  if (kind === 'translation') return 'success';
  if (kind === 'curated') return 'warning';
  return 'accent';
}

const kindDotColors: Record<ProjectResponse['kind'], string> = {
  new_novel: 'var(--sh-green-400)',
  source: 'var(--sh-indigo-400)',
  // No teal token exists yet; indigo-300 stays in the indigo family while reading distinct from source's indigo-400.
  translation: 'var(--sh-indigo-300)',
  curated: 'var(--sh-amber-400)',
};

export function projectDotColor(project: Pick<ProjectResponse, 'kind'>): string {
  return kindDotColors[project.kind] ?? 'var(--sh-green-400)';
}

/** Sidebar lifecycle labels per workflow — curated has none, so the bar hides entirely for it. */
export const LIFECYCLE_PHASES: Record<ProjectResponse['kind'], readonly string[]> = {
  new_novel: ['Bible', 'Plan', 'Arcs', 'Drafts', 'Review'],
  source: ['Bible', 'Plan', 'Arcs', 'Drafts', 'Review'],
  translation: ['Originals', 'Terms', 'Translate', 'Review', 'Publish'],
  curated: [],
};

export interface LifecyclePhase {
  completed: number;
  total: number;
  label: string;
}

/**
 * Derive a monotonic lifecycle position from a project's status, per workflow. `kind` defaults to
 * `status?.kind`, then `new_novel`, but a caller that already knows the kind (from the project itself,
 * which loads before its status) should pass it explicitly so the shell and the overview screen agree
 * on `total`/hiding from the first paint, instead of waiting on `status` to arrive. Authoring (new_novel,
 * source) runs Bible → Plan → Arcs → Drafts → Review; a phase counts as complete only when every earlier
 * phase is too, so the bar never regresses. Curated has no bar (`total` is 0). Today's status fields carry
 * nothing translation-specific, so a translation project always reports "Originals" current — the
 * Translation-screen task derives real completion from job/glossary/finalize state.
 */
export function lifecyclePhase(status?: ProjectStatusResponse, kind: ProjectResponse['kind'] = status?.kind ?? 'new_novel'): LifecyclePhase {
  const phases = LIFECYCLE_PHASES[kind];
  const total = phases.length;
  if (total === 0) return { completed: 0, total: 0, label: '' };
  if (!status || kind === 'translation') return { completed: 0, total, label: phases[0] ?? '' };
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
