/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { computeContentHash } from '@server/common';
import { type Knowledge } from '@server/database';

/**
 * Defining types
 */

/** The reader wiki-entry types, matching web-novel-server's ingest contract (a superset-equal of forge's `entity_type`). */
export type WikiEntryType = Knowledge.EntityType;

/** One spoiler-gated fragment of a wiki entry — shown by the reader only once the reader has passed `visibleFromOrdinal`. */
export interface WikiFacet {
  facetKey: string;
  content: string;
  sortOrder: number;
  visibleFromOrdinal: number;
}

export interface WikiImage {
  imageRef: string;
  caption?: string;
  sortOrder: number;
  visibleFromOrdinal: number;
}

/** The reader-clean wiki payload — nothing forge-internal, nothing unrevealed, may ever appear here (hard rule 7). */
export interface WikiEntryPayload {
  type: WikiEntryType;
  name: string;
  imageRef?: string;
  firstVisibleOrdinal: number;
  facets: WikiFacet[];
  images: WikiImage[];
}

export interface WikiEntryProjection {
  entryKey: string;
  contentHash: string;
  payload: WikiEntryPayload;
}

/** A gallery image reference (content-addressed) plus its caption/order — the portrait rides `WikiEntityInput.imageRef`. */
export interface WikiEntityImageInput {
  imageRef: string;
  caption?: string | null;
  sortOrder: number;
}

/** A single chapter-stamped relationship observation toward a target entity. */
export interface WikiRelationshipInput {
  targetKey: string;
  kind: string;
  note?: string | null;
  chapter?: number | null;
}

/** The narrow, DB-free view of an entity the pure projector needs. */
export interface WikiEntityInput {
  entityKey: string;
  type: WikiEntryType;
  name: string;
  body?: string | null;
  motivation?: string | null;
  attributes?: unknown;
  firstSeenChapter?: number | null;
  /** Content-addressed portrait ref (`entities.imagePath`), pushed verbatim as the entry's `imageRef`. */
  imageRef?: string | null;
  wikiVisibility: Knowledge.EntityWikiVisibility;
  aliases: string[];
  images: WikiEntityImageInput[];
  relationships: WikiRelationshipInput[];
}

/** A canon fact plus the chapters its ledger says it was learned in — empty means never revealed, so never projected. */
export interface WikiFactInput {
  factKey: string;
  text: string;
  subjects: string[];
  learnedInChapters: number[];
}

export interface BuildWikiProjectionsInput {
  entities: WikiEntityInput[];
  facts: WikiFactInput[];
  /** Forge chapter number → reader `publishedOrdinal`, for **published** chapters only (scheduled/failed/unpublished excluded). */
  ordinalByChapter: Map<number, number>;
}

/**
 * Declaring the constants
 */

/** The reader's wiki entry-key route pattern; a key that cannot satisfy it can never be pushed, so it is skipped. */
const ENTRY_KEY_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Translates a forge chapter number to its reader ordinal for spoiler gating. A `null`/`undefined` chapter
 * is pre-story knowledge, visible from ordinal 0. A chapter with no **published** ordinal returns `null` —
 * the caller drops that fragment entirely (absence, not gating): it reappears automatically once the chapter
 * publishes and the next converge re-derives the projection.
 */
function ordinalOf(chapter: number | null | undefined, ordinalByChapter: Map<number, number>): number | null {
  if (chapter === null || chapter === undefined) return 0;
  return ordinalByChapter.get(chapter) ?? null;
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function renderAttributeValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => renderAttributeValue(item)).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Renders a jsonb attribute bag to stable, sorted `Key: value` lines. Non-object attributes render to nothing. */
function renderAttributes(attributes: unknown): string {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return '';
  const entries = Object.entries(attributes as Record<string, unknown>).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (entries.length === 0) return '';
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${humanizeKey(key)}: ${renderAttributeValue(value)}`)
    .join('\n');
}

/** The base `profile` facet body: entity body, then motivation, then the attribute bag — each present part only. */
function renderProfile(entity: WikiEntityInput): string {
  const parts: string[] = [];
  if (entity.body?.trim()) parts.push(entity.body.trim());
  if (entity.motivation?.trim()) parts.push(`Motivation: ${entity.motivation.trim()}`);
  const attributes = renderAttributes(entity.attributes);
  if (attributes) parts.push(attributes);
  return parts.join('\n\n');
}

function renderObservation(relationship: WikiRelationshipInput, nameByKey: Map<string, string>): string {
  const target = nameByKey.get(relationship.targetKey) ?? relationship.targetKey;
  const head = `${humanizeKey(relationship.kind)} — ${target}`;
  return relationship.note?.trim() ? `${head}: ${relationship.note.trim()}` : head;
}

interface RawFacet {
  facetKey: string;
  content: string;
  visibleFromOrdinal: number;
}

/**
 * One facet per related target, its observations rendered in chapter order. An observation whose chapter has
 * no published ordinal is dropped; the facet becomes visible at the earliest **published** observation's
 * ordinal (relationship existence is established at first sighting — the incremental notes ride with it).
 */
function buildRelationshipFacets(relationships: WikiRelationshipInput[], ordinalByChapter: Map<number, number>, nameByKey: Map<string, string>): RawFacet[] {
  const byTarget = new Map<string, WikiRelationshipInput[]>();
  for (const relationship of relationships) {
    const bucket = byTarget.get(relationship.targetKey) ?? [];
    bucket.push(relationship);
    byTarget.set(relationship.targetKey, bucket);
  }

  const facets: RawFacet[] = [];
  for (const [targetKey, bucket] of [...byTarget.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const observations = bucket
      .map(relationship => ({ ordinal: ordinalOf(relationship.chapter, ordinalByChapter), relationship }))
      .filter((entry): entry is { ordinal: number; relationship: WikiRelationshipInput } => entry.ordinal !== null)
      .sort((a, b) => a.ordinal - b.ordinal || a.relationship.kind.localeCompare(b.relationship.kind));
    const [earliest] = observations;
    if (!earliest) continue;
    facets.push({
      facetKey: `rel:${targetKey}`,
      content: observations.map(entry => renderObservation(entry.relationship, nameByKey)).join('\n'),
      visibleFromOrdinal: earliest.ordinal,
    });
  }
  return facets;
}

/**
 * One facet per canon fact whose subjects include this entity. A fact with no ledger rows is never revealed —
 * pure spoiler, never included. A fact is stamped at its earliest reveal chapter's ordinal; if that specific
 * chapter is not yet published the whole fact is withheld (absence, not gating), reappearing on a later converge.
 */
function buildFactFacets(entityKey: string, facts: WikiFactInput[], ordinalByChapter: Map<number, number>): RawFacet[] {
  const facets: RawFacet[] = [];
  for (const fact of [...facts].sort((a, b) => a.factKey.localeCompare(b.factKey))) {
    if (!fact.subjects.includes(entityKey)) continue;
    if (fact.learnedInChapters.length === 0) continue;
    const visibleFromOrdinal = ordinalOf(Math.min(...fact.learnedInChapters), ordinalByChapter);
    if (visibleFromOrdinal === null) continue;
    facets.push({ facetKey: `fact:${fact.factKey}`, content: fact.text.trim(), visibleFromOrdinal });
  }
  return facets;
}

function projectEntity(entity: WikiEntityInput, facts: WikiFactInput[], ordinalByChapter: Map<number, number>, nameByKey: Map<string, string>): WikiEntryProjection | null {
  // The entity's own first-visible ordinal. `null` means it is first seen in an unpublished chapter, so its
  // profile/alias facets (and any fragment gated on that first sighting) are withheld until the chapter lands.
  const baseOrdinal = ordinalOf(entity.firstSeenChapter, ordinalByChapter);

  const raw: RawFacet[] = [];
  const profile = renderProfile(entity);
  if (profile && baseOrdinal !== null) raw.push({ facetKey: 'profile', content: profile, visibleFromOrdinal: baseOrdinal });
  if (entity.aliases.length > 0 && baseOrdinal !== null) {
    raw.push({ facetKey: 'aliases', content: `Also known as: ${[...entity.aliases].sort().join(', ')}`, visibleFromOrdinal: baseOrdinal });
  }
  raw.push(...buildRelationshipFacets(entity.relationships, ordinalByChapter, nameByKey));
  raw.push(...buildFactFacets(entity.entityKey, facts, ordinalByChapter));

  if (raw.length === 0) return null;

  const facets: WikiFacet[] = raw.map((facet, index) => ({ facetKey: facet.facetKey, content: facet.content, sortOrder: index, visibleFromOrdinal: facet.visibleFromOrdinal }));

  // Gallery images are reference art, not per-chapter reveals: they share the entity's first-visible ordinal
  // (0 when it has none). The entry itself stays hidden until `firstVisibleOrdinal`, so this never leaks art early.
  const imageOrdinal = Math.max(0, baseOrdinal ?? 0);
  const images: WikiImage[] = [...entity.images]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.imageRef.localeCompare(b.imageRef))
    .map((image, index) => ({ imageRef: image.imageRef, ...(image.caption?.trim() ? { caption: image.caption.trim() } : {}), sortOrder: index, visibleFromOrdinal: imageOrdinal }));

  const firstVisibleOrdinal = Math.min(...facets.map(facet => facet.visibleFromOrdinal));
  const payload: WikiEntryPayload = {
    type: entity.type,
    name: entity.name,
    ...(entity.imageRef ? { imageRef: entity.imageRef } : {}),
    firstVisibleOrdinal,
    facets,
    images,
  };
  return { entryKey: entity.entityKey, contentHash: computeContentHash(payload as unknown as Record<string, unknown>), payload };
}

/**
 * The pure, deterministic wiki projection: given a project's entities (+aliases/images/relationships), canon
 * facts with their reveal ledger, and the published chapter→ordinal map, produce one spoiler-gated payload per
 * visible entity. Same input always yields the same payloads and hashes. `hidden` entities, invalid-key entities,
 * and zero-facet entities are omitted — the ledger diff turns each omission into a reader-side delete.
 */
export function buildWikiProjections(input: BuildWikiProjectionsInput): WikiEntryProjection[] {
  const nameByKey = new Map(input.entities.map(entity => [entity.entityKey, entity.name]));
  const projections: WikiEntryProjection[] = [];
  for (const entity of [...input.entities].sort((a, b) => a.entityKey.localeCompare(b.entityKey))) {
    if (entity.wikiVisibility === 'hidden') continue;
    if (!ENTRY_KEY_PATTERN.test(entity.entityKey)) continue;
    const projection = projectEntity(entity, input.facts, input.ordinalByChapter, nameByKey);
    if (projection) projections.push(projection);
  }
  return projections;
}
