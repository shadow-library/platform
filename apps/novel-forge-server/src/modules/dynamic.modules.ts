/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AiModule } from '@modules/ai';
import { AppAuthModule } from '@modules/auth';
import { BibleModule } from '@modules/bible';
import { ExportModule } from '@modules/export';
import { ExtractionModule } from '@modules/extraction';
import { GenerationModule } from '@modules/generation';
import { HubActionsModule } from '@modules/hub';
import { IllustrationModule } from '@modules/illustration';
import { JobsModule } from '@modules/jobs';
import { NovelImportModule } from '@modules/novel-import';
import { PipelineModule } from '@modules/pipeline';
import { PlanImportModule } from '@modules/plan-import';
import { PlanningModule } from '@modules/planning';
import { ProjectModule } from '@modules/project';
import { RefinementModule } from '@modules/refinement';
import { SourceModule } from '@modules/source';
import { CUSTOM_DATA_TRANSFORMERS } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const AppHttpCoreModule = HttpCoreModule.forRoot({
  csrf: { disabled: true },
  openapi: { normalizeSchemaIds: true },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [
    AppHttpCoreModule,
    AppAuthModule,
    AiModule,
    ExportModule,
    ExtractionModule,
    GenerationModule,
    HubActionsModule,
    IllustrationModule,
    JobsModule,
    NovelImportModule,
    PipelineModule,
    PlanImportModule,
    PlanningModule,
    ProjectModule,
    RefinementModule,
    SourceModule,
    BibleModule,
  ],
  host: Config.get('server.host'),
  port: Config.get('server.port'),
  // Controllers carry explicit full paths (`/api/v1/*`, `/api/auth/*`) instead of a global prefix,
  // because the first-party session surface is versionless while the domain API stays under /v1.
  // Cover/portrait uploads arrive as base64 JSON (~1.33x the file size); Fastify's 1MB default
  // rejects any real image with a 413. Lift the ceiling to comfortably fit the client's 8MB cap.
  //
  // `POST /api/v1/import` (novel-import) carries a whole novel plus an optional base64 cover in one
  // JSON body — realistically a few MB, but raised to 64MB for headroom. The SDK has no per-route
  // body-limit override, so this stays one global ceiling (the smallest change that fits both
  // callers) rather than a scoped config; `validateNovelBundle`'s tighter 48MB sanity check
  // (novel-import-format.md) gives an oversized *bundle* a clear field error before it can ever hit
  // this transport-level ceiling.
  bodyLimit: 64 * 1024 * 1024,
  transformers: CUSTOM_DATA_TRANSFORMERS,
});
