/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface MockReaderChapter {
  title: string;
  content: string;
  authorNote: string | null;
  contentHash: string;
  revision: number;
  wordCount: number | null;
  publishedAt: string | null;
}

export interface MockReaderNovel {
  title: string;
  blurb: string | null;
  coverPath: string | null;
  genres: string[];
  status: string;
  revision: number;
  chapters: Map<number, MockReaderChapter>;
}

interface RecordedRequest {
  method: string;
  path: string;
  hasBearer: boolean;
}

/**
 * Declaring the constants
 *
 * An in-process reader service speaking webnovel-server's exact `/internal/*` contract: PUT novel /
 * chapter answering 200 applied, 204 no-op (same revision + same content), 409 `WBN_003` on a stale
 * incoming revision; idempotent DELETE 204; bare-array manifest. State is inspectable and wipeable
 * so specs can drive retry, stale-conflict, and wipe-and-rebuild scenarios.
 */

export class MockReaderService {
  readonly novels = new Map<string, MockReaderNovel>();
  readonly requests: RecordedRequest[] = [];
  /** Ordinals whose chapter PUT answers http 500 — simulates a reader-side failure for retry tests */
  readonly failOrdinals = new Set<number>();
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
        { ...novel, chapters: Object.fromEntries([...novel.chapters.entries()].map(([ordinal, chapter]) => [ordinal, { ...chapter }])) },
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

    const manifestMatch = /^\/internal\/novels\/([a-z0-9-]+)\/manifest$/.exec(url.pathname);
    if (manifestMatch && request.method === 'GET') return this.getManifest(manifestMatch[1] as string);

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
      revision,
    };
    const unchanged =
      stored &&
      revision === stored.revision &&
      next.title === stored.title &&
      next.blurb === stored.blurb &&
      next.coverPath === stored.coverPath &&
      next.status === stored.status &&
      JSON.stringify(next.genres) === JSON.stringify(stored.genres);
    if (unchanged) return new Response(null, { status: 204 });

    this.novels.set(slug, { ...next, chapters: stored?.chapters ?? new Map() });
    return Response.json({ slug, outcome: 'applied', revision });
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
}
