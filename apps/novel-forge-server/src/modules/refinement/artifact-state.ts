import { and, eq, inArray } from 'drizzle-orm';

import { computeContentHash } from '@server/common';
import { type Bible, type DbExecutor, schema } from '@server/database';

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
}

const MISSING: ArtifactState = { exists: false, revision: null, contentHash: null };

function parseRefs(refs: string[]): ParsedRefs {
  const parsed: ParsedRefs = { premise: false, docs: [], volumeKeys: [], chapters: [], drafts: [], entityKeys: [], factKeys: [], milestoneKeys: [] };
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
  }
  return parsed;
}

/**
 * Loads the current versioning state of every referenced artifact — the shared read used both to
 * capture a proposal's baseline and to detect conflicts at apply time. Unknown refs resolve to
 * "missing" rather than throwing, so a stale ref surfaces as a baseline mismatch, not a crash.
 * Works on a transaction handle as well as the root client.
 */
export async function loadArtifactStates(db: DbExecutor, projectId: bigint, refs: string[]): Promise<Record<string, ArtifactState>> {
  const parsed = parseRefs(refs);
  const states: Record<string, ArtifactState> = {};
  for (const ref of refs) states[ref] = MISSING;

  if (parsed.premise) {
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (project) {
      const contentHash = computeContentHash({ premise: project.premise, brief: project.brief, themes: project.themes, instructions: project.instructions });
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

  return states;
}

export type RecordFields = Readonly<Record<string, unknown>>;

/**
 * Every ref that exists, mapped to the fields an op of its kind writes — spelled as the op spells them — for the kinds a chat turn may
 * apply without review; the other kinds map to no fields, since only their existence matters there.
 */
export async function loadCurrentRecords(db: DbExecutor, projectId: bigint, refs: string[]): Promise<Map<string, RecordFields>> {
  const states = await loadArtifactStates(db, projectId, refs);
  const existing = refs.filter(ref => states[ref]?.exists);
  const parsed = parseRefs(existing);
  const records = new Map<string, RecordFields>(existing.map(ref => [ref, {}]));

  const [project, docs, volumes, entities, facts] = await Promise.all([
    parsed.premise ? db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }) : undefined,
    parsed.docs.length > 0
      ? db.query.bibleDocuments.findMany({
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
      : [],
    parsed.volumeKeys.length > 0 ? db.query.volumes.findMany({ where: and(eq(schema.volumes.projectId, projectId), inArray(schema.volumes.volumeKey, parsed.volumeKeys)) }) : [],
    parsed.entityKeys.length > 0 ? db.query.entities.findMany({ where: and(eq(schema.entities.projectId, projectId), inArray(schema.entities.entityKey, parsed.entityKeys)) }) : [],
    parsed.factKeys.length > 0 ? db.query.canonFacts.findMany({ where: and(eq(schema.canonFacts.projectId, projectId), inArray(schema.canonFacts.factKey, parsed.factKeys)) }) : [],
  ]);

  if (project) records.set('premise', { premise: project.premise, brief: project.brief, themes: project.themes, instructions: project.instructions });
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
  return records;
}
