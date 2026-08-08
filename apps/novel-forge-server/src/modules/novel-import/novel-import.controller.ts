import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, HttpMethod, HttpRoute, HttpStatus, RespondFor, type RouteOptions } from '@shadow-library/fastify';

import { JobExecutor } from '../jobs/job.executor';
import { ImportNovelBody, ImportNovelResponse } from './novel-import.dto';
import { NovelImportService } from './novel-import.service';

// `RouteOptions` only declares `method`/`path`, but `@shadow-library/fastify` forwards every extra key
// on the object straight through to Fastify's native `instance.route(...)` (verified in
// `fastify-router.js`: only `path/method/schemas/rawBody/cookies/status/headers/redirect/render` are
// stripped before the spread). `bodyLimit` is Fastify's own per-route override (`route.js`), so this is
// a real, supported per-route mechanism — not a workaround.
interface RouteOptionsWithBodyLimit extends RouteOptions {
  bodyLimit?: number;
}

// A whole novel plus an optional base64 cover in one JSON body — realistically a few MB, but given
// headroom for large multi-hundred-chapter bundles. Scoped to this one route only: every other write
// route in the app stays under the app-wide 12MB `bodyLimit` (`dynamic.modules.ts`).
const IMPORT_ROUTE_OPTIONS: RouteOptionsWithBodyLimit = { method: HttpMethod.POST, bodyLimit: 64 * 1024 * 1024 };

// Not nested under `/projects/:projectId` (unlike plan-import) — this endpoint CREATES the project,
// so there is nothing for `ProjectOwnershipGuard` to check yet; ownership is stamped on write from
// `ContextService`, exactly like `POST /api/v1/projects`.
@Authenticated()
@HttpController('/api/v1/import')
export class NovelImportController {
  constructor(
    private readonly novelImportService: NovelImportService,
    private readonly jobExecutor: JobExecutor,
  ) {}

  @HttpRoute(IMPORT_ROUTE_OPTIONS)
  @HttpStatus(202)
  @RespondFor(202, ImportNovelResponse)
  async importNovel(@Body() body: ImportNovelBody): Promise<ImportNovelResponse> {
    const response = await this.novelImportService.import(body);
    this.jobExecutor.dispatch(response.jobId).catch(() => undefined);
    return response;
  }
}
