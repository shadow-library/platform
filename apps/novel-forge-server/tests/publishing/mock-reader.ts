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
  title: string;
  blurb: string | null;
  coverPath: string | null;
  genres: string[];
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
 * incoming revision; idempotent DELETE 204; bare-array manifest. State is inspectable and wipeable
 * so specs can drive retry, stale-conflict, and wipe-and-rebuild scenarios.
 */

export class MockReaderService {
  readonly novels = new Map<string, MockReaderNovel>();
  readonly requests: RecordedRequest[] = [];
  /** Ordinals whose chapter PUT answers http 500 — simulates a reader-side failure for retry tests */
  readonly failOrdinals = new Set<number>();
  /** Entry keys whose wiki PUT answers http 500 — simulates a reader-side failure for wiki retry tests */
  readonly failWikiEntries = new Set<string>();
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

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ') ?? false;
    this.requests.push({ method: request.method, path: url.pathname, hasBearer });
    if (!hasBearer) return Response.json({ code: 'IAM_001' }, { status: 401 });

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
    const stored = this.novels.get(slug);
    if (stored && revision < stored.revision) return Response.json({ code: 'WBN_003' }, { status: 409 });

    const next = {
      title: body.title as string,
      blurb: (body.blurb as string | undefined) ?? null,
      coverPath: (body.coverPath as string | undefined) ?? null,
      genres: (body.genres as string[] | undefined) ?? [],
      status: (body.status as string | undefined) ?? 'live',
      visibility: body.visibility as string,
      revision,
    };
    const unchanged =
      stored &&
      revision === stored.revision &&
      next.title === stored.title &&
      next.blurb === stored.blurb &&
      next.coverPath === stored.coverPath &&
      next.status === stored.status &&
      next.visibility === stored.visibility &&
      JSON.stringify(next.genres) === JSON.stringify(stored.genres);
    if (unchanged) return new Response(null, { status: 204 });

    this.novels.set(slug, {
      ...next,
      organisationId: stored?.organisationId ?? null,
      subjectIds: stored?.subjectIds ?? [],
      accessRevision: stored?.accessRevision ?? 1,
      chapters: stored?.chapters ?? new Map(),
      wiki: stored?.wiki ?? new Map(),
    });
    return Response.json({ slug, outcome: 'applied', revision });
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
