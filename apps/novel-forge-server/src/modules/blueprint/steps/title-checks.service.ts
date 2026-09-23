import { and, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { ownedBy, type OwnerRef } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

import { ActorService } from '../../actor/actor.service';
import { TITLE_TEXT_MAX } from '../../ai/schemas/blueprint-title.schema';
import { loadBlueprintProject } from '../engine/blueprint-step.service';
import { TITLE_CATALOG_CHARS, TITLE_CATALOG_WORDS, TITLE_CHECK_BATCH_MAX, type TitleCheckResponse, type TitleChecksResponse } from './title-checks.dto';

const normalise = (title: string): string => title.trim().toLowerCase().replace(/\s+/g, ' ');

function catalogFit(title: string): TitleCheckResponse {
  const trimmed = title.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  if (trimmed.length <= TITLE_CATALOG_CHARS && words <= TITLE_CATALOG_WORDS) return { status: 'ok', detail: 'Fits a catalog card' };
  return { status: 'warn', detail: `Long for a catalog card: ${trimmed.length} characters in ${words} words, where about ${TITLE_CATALOG_CHARS} characters fit` };
}

/**
 * This deployment's model gateway offers no web search: the registry declares no such capability and nothing in the generation path
 * can carry a search tool, so the check is reported as not run rather than guessed at. Turning it on means declaring the capability
 * on the model, threading a tool through `ModelRouterService.structured`, and replacing this function — never relaxing its wording.
 */
function publishedTitles(): TitleCheckResponse {
  return { status: 'unknown', detail: 'Similar published titles weren’t checked — this Novel Forge has no web search. Search the title yourself before you publish.' };
}

/** The caller's own library and the shape of a catalog card, checked without a model call. */
@Injectable()
export class TitleChecksService {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly actorService: ActorService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async check(projectId: bigint, titles: string[]): Promise<TitleChecksResponse[]> {
    const project = await loadBlueprintProject(this.db, projectId);
    const wanted = [...new Set(titles.map(title => title.trim()).filter(Boolean))];
    const tooLong = wanted.find(title => title.length > TITLE_TEXT_MAX);
    if (tooLong !== undefined) throw AppErrorCode.BPR_004.create({ part: 'titles', issues: `a title is longer than ${TITLE_TEXT_MAX} characters` });

    // The library is the caller's own shelf, never the owner's: a curator on a shared novel would otherwise get a yes/no oracle
    // over every title the owner has ever used.
    const used = await this.libraryTitles(project.id, this.actorService.current());
    return wanted.slice(0, TITLE_CHECK_BATCH_MAX).map(title => ({
      title,
      catalogFit: catalogFit(title),
      library: used.has(normalise(title))
        ? { status: 'warn' as const, detail: 'Another novel of yours already has this title' }
        : { status: 'ok' as const, detail: 'Not used in your library' },
      published: publishedTitles(),
    }));
  }

  private async libraryTitles(projectId: bigint, owner: OwnerRef): Promise<Set<string>> {
    const rows = await this.db
      .select({ name: schema.projects.name, title: schema.projects.title })
      .from(schema.projects)
      .where(and(ownedBy(schema.projects, owner), ne(schema.projects.id, projectId)));
    return new Set(rows.flatMap(row => [row.title, row.name].filter((value): value is string => Boolean(value)).map(normalise)));
  }
}
