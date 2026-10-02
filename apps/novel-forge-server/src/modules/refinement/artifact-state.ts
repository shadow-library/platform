import { and, eq, inArray } from 'drizzle-orm';

import { computeContentHash } from '@server/common';
import { type Bible, type DbExecutor, schema } from '@server/database';

import { type PromiseKind } from './change-set';

export interface ArtifactState {
  exists: boolean;
  revision: number | null;
  contentHash: string | null;
}

interface ParsedRefs {
  premise: boolean;
  docs: { section: Bible.Section; slug: string; ref: string }[];
  volumeKeys: string[];
  chapters: number[];
  drafts: number[];
  entityKeys: string[];
  factKeys: string[];
  milestoneKeys: string[];
  promiseKeys: { kind: PromiseKind; key: string; ref: string }[];
}

export const MISSING_ARTIFACT: ArtifactState = { exists: false, revision: null, contentHash: null };

function parseRefs(refs: string[]): ParsedRefs {
  const parsed: ParsedRefs = { premise: false, docs: [], volumeKeys: [], chapters: [], drafts: [], entityKeys: [], factKeys: [], milestoneKeys: [], promiseKeys: [] };
  for (const ref of refs) {
    if (ref === 'premise') parsed.premise = true;
    else if (ref.startsWith('doc:')) {
      const [section = '', ...rest] = ref.slice(4).split('/');
      parsed.docs.push({ section: section as Bible.Section, slug: rest.join('/'), ref });
    } else if (ref.startsWith('volume:')) parsed.volumeKeys.push(ref.slice(7));
    else if (ref.startsWith('chapter:')) parsed.chapters.push(Number(ref.slice(8)));
    else if (ref.startsWith('draft:')) parsed.drafts.push(Number(ref.slice(6)));
    else if (ref.startsWith('entity:')) parsed.entityKeys.push(ref.slice(7));
    else if (ref.startsWith('fact:')) parsed.factKeys.push(ref.slice(5));
    else if (ref.startsWith('milestone:')) parsed.milestoneKeys.push(ref.slice(10));
    else if (ref.startsWith('promise:')) {
      const [kind = '', ...rest] = ref.slice(8).split(':');
      parsed.promiseKeys.push({ kind: kind as PromiseKind, key: rest.join(':'), ref });
    }
  }
  return parsed;
}

/**
 * Loads the current versioning state of every referenced artifact — the shared read used both to
 * capture a proposal's baseline and to detect conflicts at apply time. Unknown refs resolve to
 * "missing" rather than throwing, so a stale ref surfaces as a baseline mismatch, not a crash.
 * Works on a transaction handle as well as the root client.
 */
const STORY_FIELDS = ['theme', 'readerPromise', 'protagonistKey', 'opposition', 'endingQuestion', 'ending'] as const;

type PremiseRow = Pick<typeof schema.projects.$inferSelect, 'premise' | 'brief' | 'themes' | 'instructions' | (typeof STORY_FIELDS)[number]>;

function premiseFields(project: PremiseRow): Record<string, unknown> {
  return { premise: project.premise, brief: project.brief, themes: project.themes, instructions: project.instructions };
}

// A story field joins the hash only once it holds a value, so the baseline of every premise card staged before these fields existed still matches.
function premiseHashInput(project: PremiseRow): Record<string, unknown> {
  const story = STORY_FIELDS.flatMap(field => ((project[field] ?? null) === null ? [] : [[field, project[field]] as const]));
  return { ...premiseFields(project), ...Object.fromEntries(story) };
}

export async function loadArtifactStates(db: DbExecutor, projectId: bigint, refs: string[]): Promise<Record<string, ArtifactState>> {
  const parsed = parseRefs(refs);
  const states: Record<string, ArtifactState> = {};
  for (const ref of refs) states[ref] = MISSING_ARTIFACT;

  if (parsed.premise) {
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (project) {
      const contentHash = computeContentHash(premiseHashInput(project));
      states['premise'] = { exists: true, revision: null, contentHash };
    }
  }

  if (parsed.docs.length > 0) {
    const rows = await db.query.bibleDocuments.findMany({
      where: and(
        eq(schema.bibleDocuments.projectId, projectId),
        inArray(
          schema.bibleDocuments.slug,
          parsed.docs.map(d => d.slug),
        ),
      ),
    });
    for (const doc of parsed.docs) {
      const row = rows.find(r => r.section === doc.section && r.slug === doc.slug);
      if (row) states[doc.ref] = { exists: true, revision: row.revision, contentHash: row.contentHash };
    }
  }

  if (parsed.volumeKeys.length > 0) {
    const rows = await db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.volumeKey, parsed.volumeKeys)) });
    for (const row of rows) states[`volume:${row.volumeKey}`] = { exists: true, revision: row.revision, contentHash: row.contentHash };
  }

  if (parsed.chapters.length > 0) {
    const rows = await db.query.briefs.findMany({ where: and(eq(schema.briefs.projectId, projectId), inArray(schema.briefs.chapter, parsed.chapters)) });
    for (const row of rows) states[`chapter:${row.chapter}`] = { exists: true, revision: row.revision, contentHash: row.contentHash };
  }

  // Drafts store no contentHash — hash the refinable prose fields at read time (like entities below).
  if (parsed.drafts.length > 0) {
    const rows = await db.query.drafts.findMany({ where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.chapter, parsed.drafts)) });
    for (const row of rows) {
      const contentHash = computeContentHash({ title: row.title, body: row.body, summary: row.summary });
      states[`draft:${row.chapter}`] = { exists: true, revision: row.revision, contentHash };
    }
  }

  // Entities carry no revision column — their state is a content hash over the refinable fields.
  if (parsed.entityKeys.length > 0) {
    const rows = await db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, parsed.entityKeys)) });
    for (const row of rows) {
      const contentHash = computeContentHash({ name: row.name, type: row.type, status: row.status, motivation: row.motivation, notes: row.notes, body: row.body });
      states[`entity:${row.entityKey}`] = { exists: true, revision: null, contentHash };
    }
  }

  if (parsed.factKeys.length > 0) {
    const rows = await db.query.canonFacts.findMany({ where: and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.factKey, parsed.factKeys)) });
    for (const row of rows) {
      const hashed: Record<string, unknown> = { text: row.text, subjects: row.subjects, constraintNote: row.constraintNote, terms: row.terms, revealChapter: row.revealChapter };
      // Columns added after baselines were first recorded join the hash only once set, so those baselines stay current.
      for (const [field, value] of Object.entries({ writerNote: row.writerNote, unlock: row.unlock, allowedClues: row.allowedClues })) {
        if (value !== null) hashed[field] = value;
      }
      const contentHash = computeContentHash(hashed);
      states[`fact:${row.factKey}`] = { exists: true, revision: null, contentHash };
    }
  }

  // State is derived from plans and finalized chapters, so only what an op can write is hashed.
  if (parsed.milestoneKeys.length > 0) {
    const rows = await db.query.milestones.findMany({ where: and(eq(schema.milestones.projectId, projectId), inArray(schema.milestones.milestoneKey, parsed.milestoneKeys)) });
    for (const row of rows) {
      const contentHash = computeContentHash({ label: row.label, subjectEntityKey: row.subjectEntityKey, kind: row.kind });
      states[`milestone:${row.milestoneKey}`] = { exists: true, revision: null, contentHash };
    }
  }

  const threadKeys = parsed.promiseKeys.filter(p => p.kind === 'thread').map(p => p.key);
  const mysteryKeys = parsed.promiseKeys.filter(p => p.kind === 'mystery').map(p => p.key);
  if (threadKeys.length > 0) {
    const rows = await db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), inArray(schema.plotThreads.threadKey, threadKeys)) });
    for (const row of rows) {
      const contentHash = computeContentHash({
        label: row.summary,
        status: row.status,
        closedChapter: row.closedChapter,
        lastAdvancedChapter: row.lastAdvancedChapter,
        payoffWindow: row.payoffWindow,
        payoffMilestoneKey: row.payoffMilestoneKey,
        payoffVolumeKey: row.payoffVolumeKey,
        intentionallyOpen: row.intentionallyOpen,
      });
      states[`promise:thread:${row.threadKey}`] = { exists: true, revision: null, contentHash };
    }
  }
  if (mysteryKeys.length > 0) {
    const rows = await db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), inArray(schema.mysteries.mysteryKey, mysteryKeys)) });
    for (const row of rows) {
      const contentHash = computeContentHash({
        label: row.question,
        status: row.status,
        resolvedChapter: row.resolvedChapter,
        lastAdvancedChapter: row.lastAdvancedChapter,
        payoffWindow: row.payoffWindow,
        payoffMilestoneKey: row.payoffMilestoneKey,
        payoffVolumeKey: row.payoffVolumeKey,
        intentionallyOpen: row.intentionallyOpen,
      });
      states[`promise:mystery:${row.mysteryKey}`] = { exists: true, revision: null, contentHash };
    }
  }

  return states;
}

export type RecordFields = Readonly<Record<string, unknown>>;

interface PromiseRow {
  lastAdvancedChapter: number | null;
  status: string;
  payoffMilestoneKey: string | null;
  payoffVolumeKey: string | null;
  payoffWindow: number | null;
  intentionallyOpen: boolean;
}

function promiseFields(row: PromiseRow, label: string | null): RecordFields {
  return {
    label,
    lastAdvancedChapter: row.lastAdvancedChapter,
    status: row.status,
    payoffMilestoneKey: row.payoffMilestoneKey,
    payoffVolumeKey: row.payoffVolumeKey,
    payoffWindow: row.payoffWindow,
    dormant: row.intentionallyOpen,
  };
}

/**
 * Every ref that exists, mapped to the fields an op of its kind writes — spelled as the op spells them — for the kinds a chat turn may
 * apply without review or could empty; the other kinds map to no fields, since only their existence matters there.
 */
export async function loadCurrentRecords(db: DbExecutor, projectId: bigint, refs: string[]): Promise<Map<string, RecordFields>> {
  const states = await loadArtifactStates(db, projectId, refs);
  const existing = refs.filter(ref => states[ref]?.exists);
  const parsed = parseRefs(existing);
  const records = new Map<string, RecordFields>(existing.map(ref => [ref, {}]));

  const threadKeys = parsed.promiseKeys.filter(p => p.kind === 'thread').map(p => p.key);
  const mysteryKeys = parsed.promiseKeys.filter(p => p.kind === 'mystery').map(p => p.key);
  const project = parsed.premise ? await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }) : undefined;
  const docs =
    parsed.docs.length > 0
      ? await db.query.bibleDocuments.findMany({
          where: and(
            eq(schema.bibleDocuments.projectId, projectId),
            inArray(
              schema.bibleDocuments.section,
              parsed.docs.map(doc => doc.section),
            ),
            inArray(
              schema.bibleDocuments.slug,
              parsed.docs.map(doc => doc.slug),
            ),
          ),
        })
      : [];
  const volumes =
    parsed.volumeKeys.length > 0
      ? await db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.volumeKey, parsed.volumeKeys)) })
      : [];
  const entities =
    parsed.entityKeys.length > 0
      ? await db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, parsed.entityKeys)) })
      : [];
  const facts =
    parsed.factKeys.length > 0
      ? await db.query.canonFacts.findMany({ where: and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.factKey, parsed.factKeys)) })
      : [];
  const threads =
    threadKeys.length > 0
      ? await db.query.plotThreads.findMany({ where: and(eq(schema.plotThreads.projectId, projectId), inArray(schema.plotThreads.threadKey, threadKeys)) })
      : [];
  const mysteries =
    mysteryKeys.length > 0 ? await db.query.mysteries.findMany({ where: and(eq(schema.mysteries.projectId, projectId), inArray(schema.mysteries.mysteryKey, mysteryKeys)) }) : [];
  const milestones =
    parsed.milestoneKeys.length > 0
      ? await db.query.milestones.findMany({ where: and(eq(schema.milestones.projectId, projectId), inArray(schema.milestones.milestoneKey, parsed.milestoneKeys)) })
      : [];

  if (project) records.set('premise', { ...premiseFields(project), ...Object.fromEntries(STORY_FIELDS.map(field => [field, project[field]])) });
  for (const row of docs) {
    const ref = `doc:${row.section}/${row.slug}`;
    if (records.has(ref)) records.set(ref, { body: row.body, frontmatter: row.frontmatter });
  }
  for (const row of volumes) records.set(`volume:${row.volumeKey}`, { ordinal: row.ordinal, title: row.title, objective: row.objective, body: row.body, state: row.state });
  for (const row of entities) {
    records.set(`entity:${row.entityKey}`, { type: row.type, name: row.name, status: row.status, motivation: row.motivation, notes: row.notes, body: row.body });
  }
  for (const row of facts) {
    records.set(`fact:${row.factKey}`, {
      body: row.text,
      subjects: row.subjects,
      constraintNote: row.constraintNote,
      writerNote: row.writerNote,
      terms: row.terms,
      revealChapter: row.revealChapter,
      unlock: row.unlock,
      allowedClues: row.allowedClues,
    });
  }
  for (const row of milestones) records.set(`milestone:${row.milestoneKey}`, { label: row.label, subjectEntityKey: row.subjectEntityKey, kind: row.kind });
  for (const row of threads) records.set(`promise:thread:${row.threadKey}`, promiseFields(row, row.summary));
  for (const row of mysteries) records.set(`promise:mystery:${row.mysteryKey}`, promiseFields(row, row.question));
  return records;
}
