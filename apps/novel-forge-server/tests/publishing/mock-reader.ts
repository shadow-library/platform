import { CONTENT_RATING_DIMENSIONS, isGenre, isRatingLevel, isTag } from '@shadow-library/sdk';

export interface MockReaderChapter {
  title: string;
  content: string;
  authorNote: string | null;
  contentHash: string;
  revision: number;
  wordCount: number | null;
  publishedAt: string | null;
}

export interface MockReaderWikiEntry {
  type: string;
  name: string;
  imageRef: string | null;
  firstVisibleOrdinal: number;
  contentHash: string;
  revision: number;
  facets: unknown[];
  images: unknown[];
}

export interface MockReaderNovel {
  /** The publisher's own identifier for the row; it, not the map key, decides which row a push resolves. */
  sourceRef: string;
  title: string;
  originalAuthor: string | null;
  blurb: string | null;
  coverPath: string | null;
  genres: string[];
  tags: string[];
  sexualContent: string | null;
  violence: string | null;
  darkContent: string | null;
  status: string;
  visibility: string;
  revision: number;
  /** The access record, carried so `snapshot()` still proves a wiped reader converges to identical state. */
  organisationId: string | null;
  subjectIds: string[];
  accessRevision: number;
  chapters: Map<number, MockReaderChapter>;
  wiki: Map<string, MockReaderWikiEntry>;
}

interface RecordedRequest {
  method: string;
  path: string;
  hasBearer: boolean;
}

/**
 * An in-process reader service speaking web-novel-server's exact `/internal/*` contract: PUT novel /
 * chapter answering 200 applied, 204 no-op (same revision + same content), 409 `WBN_003` on a stale
 * incoming revision, 409 `WBN_010` on a slug another publisher owns and 400 `WBN_011` on a payload
 * whose hash it recomputes differently; idempotent DELETE 204; bare-array manifest. A novel push is
 * resolved by its `sourceRef` alone, so a push under a new slug renames the row — the map key moves
 * and the chapters, wiki and access record travel with it — exactly as `publish.service.ts`'s
 * `lockNovel` does. State is inspectable and wipeable so specs can drive retry, conflict, and
 * wipe-and-rebuild scenarios.
 */

export class MockReaderService {
  readonly novels = new Map<string, MockReaderNovel>();
  readonly requests: RecordedRequest[] = [];
  /** Ordinals whose chapter PUT answers http 500 — simulates a reader-side failure for retry tests */
  readonly failOrdinals = new Set<number>();
  /** Entry keys whose wiki PUT answers http 500 — simulates a reader-side failure for wiki retry tests */
  readonly failWikiEntries = new Set<string>();
  /** Slugs the reader serves for another publisher — writes are refused `WBN_010`, reads answer `WBN_001` as `publish-ownership.ts` does */
  readonly foreignSlugs = new Set<string>();
  /** Ordinals whose chapter PUT answers 400 `WBN_011` — simulates a payload whose hash the reader recomputes differently */
  readonly mismatchOrdinals = new Set<number>();
  private server: ReturnType<typeof Bun.serve> | null = null;

  start(): string {
    this.server = Bun.serve({ port: 0, fetch: request => this.handle(request) });
    return this.server.url.origin;
  }

  stop(): void {
    this.server?.stop(true);
    this.server = null;
  }

  /** The §6 disaster scenario: the reader's content tables are gone; only reconcile can rebuild them */
  wipe(): void {
    this.novels.clear();
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(
      [...this.novels.entries()].map(([slug, novel]) => [
        slug,
        {
          ...novel,
          chapters: Object.fromEntries([...novel.chapters.entries()].map(([ordinal, chapter]) => [ordinal, { ...chapter }])),
          wiki: Object.fromEntries([...novel.wiki.entries()].map(([entryKey, entry]) => [entryKey, { ...entry }])),
        },
      ]),
    );
  }

  /** Mirrors the reader's `uniqueItems` + closed-enum rejection so a duplicate or unknown term fails the push here exactly as it would in production. */
  private isVocabulary(values: unknown, isMember: (value: unknown) => boolean): boolean {
    if (values === undefined) return true;
    if (!Array.isArray(values)) return false;
    return values.every(isMember) && new Set(values).size === values.length;
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ') ?? false;
    this.requests.push({ method: request.method, path: url.pathname, hasBearer });
    if (!hasBearer) return Response.json({ code: 'IAM_001' }, { status: 401 });

    // A read of a foreign slug must be indistinguishable from a missing one, or 409-vs-404 becomes an oracle over another publisher's slugs.
    const owned = /^\/internal\/novels\/([a-z0-9-]+)(?:\/|$)/.exec(url.pathname);
    if (owned && this.foreignSlugs.has(owned[1] as string)) {
      if (request.method === 'GET') return Response.json({ code: 'WBN_001' }, { status: 404 });
      return Response.json({ code: 'WBN_010' }, { status: 409 });
    }

    const novelMatch = /^\/internal\/novels\/([a-z0-9-]+)$/.exec(url.pathname);
    if (novelMatch && request.method === 'PUT') return this.upsertNovel(novelMatch[1] as string, (await request.json()) as Record<string, unknown>);

    const accessMatch = /^\/internal\/novels\/([a-z0-9-]+)\/access$/.exec(url.pathname);
    if (accessMatch && request.method === 'PUT') return this.upsertAccess(accessMatch[1] as string, (await request.json()) as Record<string, unknown>);
    if (accessMatch && request.method === 'GET') return this.getAccess(accessMatch[1] as string);

    const manifestMatch = /^\/internal\/novels\/([a-z0-9-]+)\/manifest$/.exec(url.pathname);
    if (manifestMatch && request.method === 'GET') return this.getManifest(manifestMatch[1] as string);

    const wikiManifestMatch = /^\/internal\/novels\/([a-z0-9-]+)\/wiki\/manifest$/.exec(url.pathname);
    if (wikiManifestMatch && request.method === 'GET') return this.getWikiManifest(wikiManifestMatch[1] as string);

    const wikiEntryMatch = /^\/internal\/novels\/([a-z0-9-]+)\/wiki\/([A-Za-z0-9._-]+)$/.exec(url.pathname);
    if (wikiEntryMatch && request.method === 'PUT')
      return this.upsertWiki(wikiEntryMatch[1] as string, wikiEntryMatch[2] as string, (await request.json()) as Record<string, unknown>);
    if (wikiEntryMatch && request.method === 'DELETE') return this.deleteWiki(wikiEntryMatch[1] as string, wikiEntryMatch[2] as string);

    const chapterMatch = /^\/internal\/novels\/([a-z0-9-]+)\/chapters\/(\d+)$/.exec(url.pathname);
    if (chapterMatch && request.method === 'PUT') return this.upsertChapter(chapterMatch[1] as string, Number(chapterMatch[2]), (await request.json()) as Record<string, unknown>);
    if (chapterMatch && request.method === 'DELETE') return this.deleteChapter(chapterMatch[1] as string, Number(chapterMatch[2]));

    return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
  }

  private upsertNovel(slug: string, body: Record<string, unknown>): Response {
    const revision = body.revision as number;
    const sourceRef = body.sourceRef as string;
    const held = this.resolveNovel(slug, sourceRef);
    if (held === 'taken') return Response.json({ code: 'WBN_010' }, { status: 409 });
    const [storedSlug, stored] = held;
    if (stored && revision < stored.revision) return Response.json({ code: 'WBN_003' }, { status: 409 });
    if (!this.isVocabulary(body.genres, isGenre) || !this.isVocabulary(body.tags, isTag)) return Response.json({ code: 'WBN_002' }, { status: 422 });
    // The reader declares `originalAuthor` with `minLength: 1`, so a blank one is a rejected payload rather than a clear.
    if (body.originalAuthor !== undefined && (typeof body.originalAuthor !== 'string' || body.originalAuthor.length === 0 || body.originalAuthor.length > 256))
      return Response.json({ code: 'WBN_002' }, { status: 422 });
    const ratings = CONTENT_RATING_DIMENSIONS.map(dimension => [dimension, body[dimension]] as const);
    if (ratings.some(([dimension, level]) => level !== undefined && !isRatingLevel(dimension, level))) return Response.json({ code: 'WBN_002' }, { status: 422 });

    const next = {
      title: body.title as string,
      originalAuthor: (body.originalAuthor as string | undefined) ?? null,
      blurb: (body.blurb as string | undefined) ?? null,
      coverPath: (body.coverPath as string | undefined) ?? null,
      genres: (body.genres as string[] | undefined) ?? [],
      tags: (body.tags as string[] | undefined) ?? [],
      sexualContent: (body.sexualContent as string | undefined) ?? null,
      violence: (body.violence as string | undefined) ?? null,
      darkContent: (body.darkContent as string | undefined) ?? null,
      status: (body.status as string | undefined) ?? 'live',
      visibility: body.visibility as string,
      revision,
    };
    const unchanged =
      stored &&
      storedSlug === slug &&
      revision === stored.revision &&
      next.title === stored.title &&
      next.originalAuthor === stored.originalAuthor &&
      next.blurb === stored.blurb &&
      next.coverPath === stored.coverPath &&
      next.status === stored.status &&
      next.visibility === stored.visibility &&
      next.sexualContent === stored.sexualContent &&
      next.violence === stored.violence &&
      next.darkContent === stored.darkContent &&
      JSON.stringify(next.genres) === JSON.stringify(stored.genres) &&
      JSON.stringify(next.tags) === JSON.stringify(stored.tags);
    if (unchanged) return new Response(null, { status: 204 });
    // A rename onto a slug another row already holds violates the reader's unique slug, which its update path reports as WBN_010.
    if (storedSlug !== slug && this.isSlugTaken(slug)) return Response.json({ code: 'WBN_010' }, { status: 409 });

    this.novels.delete(storedSlug);
    this.novels.set(slug, {
      ...next,
      sourceRef,
      organisationId: stored?.organisationId ?? null,
      subjectIds: stored?.subjectIds ?? [],
      accessRevision: stored?.accessRevision ?? 1,
      chapters: stored?.chapters ?? new Map(),
      wiki: stored?.wiki ?? new Map(),
    });
    return Response.json({ slug, outcome: 'applied', revision });
  }

  /**
   * `lockNovel`'s resolution: only the publisher's own ref resolves a row, and the slug is read solely to
   * find out whether a create can hold it. Anything already there is a different novel, refused rather
   * than overwritten.
   */
  private resolveNovel(slug: string, sourceRef: string): [string, MockReaderNovel | undefined] | 'taken' {
    // A row parked on a foreign slug belongs to another publisher, whose refs live in a different key space: it can never match ours.
    const owned = [...this.novels.entries()].find(([key, novel]) => novel.sourceRef === sourceRef && !this.foreignSlugs.has(key));
    if (owned) return owned;
    return this.isSlugTaken(slug) ? 'taken' : [slug, undefined];
  }

  /** `handle()` refuses a foreign slug before any of this runs; checking it here too keeps the refusal correct if it ever stops. */
  private isSlugTaken(slug: string): boolean {
    return this.novels.has(slug) || this.foreignSlugs.has(slug);
  }

  /** Mirrors the reader's access sub-resource, including its own revision ladder. */
  private upsertAccess(slug: string, body: Record<string, unknown>): Response {
    const stored = this.novels.get(slug);
    if (!stored) return Response.json({ code: 'WBN_001' }, { status: 404 });

    const revision = body.revision as number;
    if (revision < stored.accessRevision) return Response.json({ code: 'WBN_003' }, { status: 409 });

    const visibility = body.visibility as string;
    const organisationId = (body.organisationId as string | undefined) ?? null;
    const subjectIds = [...new Set((body.subjectIds as string[] | undefined) ?? [])].sort();
    const unchanged =
      revision === stored.accessRevision &&
      visibility === stored.visibility &&
      organisationId === stored.organisationId &&
      JSON.stringify(subjectIds) === JSON.stringify([...stored.subjectIds].sort());
    if (unchanged) return new Response(null, { status: 204 });

    this.novels.set(slug, { ...stored, visibility, organisationId, subjectIds, accessRevision: revision });
    return Response.json({ slug, outcome: 'applied', revision });
  }

  private getAccess(slug: string): Response {
    const novel = this.novels.get(slug);
    if (!novel) return Response.json({ code: 'WBN_001' }, { status: 404 });
    return Response.json({
      visibility: novel.visibility,
      organisationId: novel.organisationId ?? undefined,
      subjectIds: [...novel.subjectIds].sort(),
      revision: novel.accessRevision,
    });
  }

  private upsertChapter(slug: string, ordinal: number, body: Record<string, unknown>): Response {
    const novel = this.novels.get(slug);
    if (!novel) return Response.json({ code: 'WBN_001' }, { status: 404 });
    if (this.failOrdinals.has(ordinal)) return Response.json({ code: 'WBN_500' }, { status: 500 });
    if (this.mismatchOrdinals.has(ordinal)) return Response.json({ code: 'WBN_011' }, { status: 400 });

    const revision = body.revision as number;
    const contentHash = body.contentHash as string;
    const stored = novel.chapters.get(ordinal);
    if (stored && revision < stored.revision) return Response.json({ code: 'WBN_003' }, { status: 409 });
    if (stored && revision === stored.revision && contentHash === stored.contentHash) return new Response(null, { status: 204 });

    novel.chapters.set(ordinal, {
      title: body.title as string,
      content: body.content as string,
      authorNote: (body.authorNote as string | undefined) ?? null,
      contentHash,
      revision,
      wordCount: (body.wordCount as number | undefined) ?? null,
      publishedAt: (body.publishedAt as string | undefined) ?? null,
    });
    return Response.json({ slug, outcome: 'applied', revision });
  }

  private deleteChapter(slug: string, ordinal: number): Response {
    this.novels.get(slug)?.chapters.delete(ordinal);
    return new Response(null, { status: 204 });
  }

  private getManifest(slug: string): Response {
    const novel = this.novels.get(slug);
    if (!novel) return Response.json({ code: 'WBN_001' }, { status: 404 });
    const items = [...novel.chapters.entries()].sort(([a], [b]) => a - b).map(([ordinal, chapter]) => ({ ordinal, contentHash: chapter.contentHash, revision: chapter.revision }));
    return Response.json(items);
  }

  private upsertWiki(slug: string, entryKey: string, body: Record<string, unknown>): Response {
    const novel = this.novels.get(slug);
    if (!novel) return Response.json({ code: 'WBN_001' }, { status: 404 });
    if (this.failWikiEntries.has(entryKey)) return Response.json({ code: 'WBN_500' }, { status: 500 });

    const revision = body.revision as number;
    const contentHash = body.contentHash as string;
    const stored = novel.wiki.get(entryKey);
    if (stored && revision < stored.revision) return Response.json({ code: 'WBN_003' }, { status: 409 });
    if (stored && revision === stored.revision && contentHash === stored.contentHash) return new Response(null, { status: 204 });

    novel.wiki.set(entryKey, {
      type: body.type as string,
      name: body.name as string,
      imageRef: (body.imageRef as string | undefined) ?? null,
      firstVisibleOrdinal: body.firstVisibleOrdinal as number,
      contentHash,
      revision,
      facets: (body.facets as unknown[] | undefined) ?? [],
      images: (body.images as unknown[] | undefined) ?? [],
    });
    return Response.json({ slug, outcome: 'applied', revision });
  }

  private deleteWiki(slug: string, entryKey: string): Response {
    this.novels.get(slug)?.wiki.delete(entryKey);
    return new Response(null, { status: 204 });
  }

  private getWikiManifest(slug: string): Response {
    const novel = this.novels.get(slug);
    if (!novel) return Response.json({ code: 'WBN_001' }, { status: 404 });
    const items = [...novel.wiki.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([entryKey, entry]) => ({ entryKey, contentHash: entry.contentHash, revision: entry.revision }));
    return Response.json(items);
  }
}
