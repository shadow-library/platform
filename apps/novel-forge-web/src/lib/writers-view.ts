import { type WriterAttemptRole, type WriterSnapshotDetailResponse, type WriterSnapshotSummaryResponse } from '@/lib/apis';
import { isRecord } from '@/lib/is-record';

const ROLE_LABELS: Record<WriterAttemptRole, string> = {
  draft: 'First draft',
  repair: 'Repair',
  rewrite: 'Rewrite',
  revise: 'Revision',
  passage: 'Passage rewrite',
};

export function roleLabel(role: WriterAttemptRole): string {
  return ROLE_LABELS[role];
}

type SnapshotSummary = Pick<WriterSnapshotSummaryResponse, 'id' | 'draftRevision' | 'attempt' | 'role' | 'createdAt'>;

export interface WritingRun<T extends SnapshotSummary = SnapshotSummary> {
  key: string;
  label: string;
  /** In attempt order; a repair follows the draft it fixed. */
  attempts: T[];
}

/** One run is the attempts a single writing call made against one version; the newest run comes first. */
export function writingRuns<T extends SnapshotSummary>(snapshots: readonly T[]): WritingRun<T>[] {
  const runs = new Map<string, T[]>();
  for (const snapshot of snapshots) {
    const kind = snapshot.role === 'passage' ? `passage:${snapshot.id}` : snapshot.role === 'revise' || snapshot.role === 'rewrite' ? `${snapshot.role}:${snapshot.id}` : 'write';
    const key = `${snapshot.draftRevision}:${kind}`;
    runs.set(key, [...(runs.get(key) ?? []), snapshot]);
  }
  return [...runs.entries()]
    .map(([key, attempts]) => {
      const sorted = [...attempts].sort((a, b) => a.attempt - b.attempt || a.createdAt.localeCompare(b.createdAt));
      const first = sorted[0];
      const role = first?.role === 'repair' ? 'draft' : (first?.role ?? 'draft');
      return { key, label: `${roleLabel(role)} · version ${first?.draftRevision ?? 0}`, attempts: sorted };
    })
    .sort((a, b) => (b.attempts[0]?.createdAt ?? '').localeCompare(a.attempts[0]?.createdAt ?? ''));
}

export function attemptWhat(snapshot: Pick<WriterSnapshotSummaryResponse, 'role' | 'attempt'>, total: number): string {
  if (snapshot.role === 'repair')
    return `The repair: the earlier attempt’s draft plus the check’s note${total > 1 && snapshot.attempt === total ? ' — this became the chapter' : ''}.`;
  if (snapshot.role === 'draft') return total > 1 && snapshot.attempt < total ? 'First draft. A check found a problem, so it was repaired.' : 'First draft, written from the plan.';
  if (snapshot.role === 'passage') return 'A rewrite of one passage you selected, with the rest of the chapter for context.';
  if (snapshot.role === 'revise') return 'A revision of the whole chapter from your note.';
  return 'A rewrite of the whole chapter.';
}

export interface KeptBackView {
  secrecy: string[];
  budget: string[];
}

const FIELD_LABELS: Record<string, string> = {
  prose: 'earlier prose',
  summary: 'chapter summaries',
  state: 'where things stand',
  entity: 'characters and places',
  reference: 'references',
  bible_page: 'Story Bible pages',
  heading: 'headings',
  plan: 'the plan',
  style: 'the style guide',
  writer_line: 'writer notes',
  knowledge: 'what characters know',
  note: 'your notes',
  plugin: 'plugin material',
};

/** `keptBack` is stored as the server recorded it at writing time, so every field is narrowed rather than trusted. */
export function keptBackView(keptBack: WriterSnapshotDetailResponse['keptBack']): KeptBackView {
  if (!isRecord(keptBack)) return { secrecy: [], budget: [] };
  const withheld = isRecord(keptBack.withheldForSecrecy) ? keptBack.withheldForSecrecy : {};
  const secrecy = Object.entries(withheld)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([field, count]) => `${count === 1 ? '1 passage' : `${count} passages`} withheld from ${FIELD_LABELS[field] ?? field.replace(/_/g, ' ')}`);
  const omitted = Array.isArray(keptBack.omittedForBudget) ? keptBack.omittedForBudget : [];
  const budget = omitted.filter(isRecord).map(section => (typeof section.key === 'string' ? section.key : 'a section'));
  return { secrecy, budget };
}

export function snapshotMeta(snapshot: Pick<WriterSnapshotDetailResponse, 'attempt' | 'planRevision' | 'createdAt'>, total: number, formatDate: (iso: string) => string): string {
  const plan = snapshot.planRevision != null ? ` · plan version ${snapshot.planRevision}` : '';
  return `Stored at writing time · attempt ${snapshot.attempt} of ${total}${plan} · Story Bible as of ${formatDate(snapshot.createdAt)}. Exactly what was sent — not rebuilt from today’s Story Bible.`;
}

const MESSAGE_ROLES: Record<string, string> = { system: 'Instructions', user: 'Material and request', assistant: 'Earlier reply' };

export function messageLabel(role: string): string {
  return MESSAGE_ROLES[role] ?? role;
}
