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
import { ApiKeyModule } from '@modules/api-key';
import { AppAuthModule } from '@modules/auth';
import { BibleModule } from '@modules/bible';
import { CuratedIngestModule } from '@modules/curated-ingest';
import { ExportModule } from '@modules/export';
import { ExtractionModule } from '@modules/extraction';
import { GenerationModule } from '@modules/generation';
import { HubActionsModule } from '@modules/hub';
import { IdeationModule } from '@modules/ideation';
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
    ApiKeyModule,
    CuratedIngestModule,
    ExportModule,
    ExtractionModule,
    GenerationModule,
    HubActionsModule,
    IdeationModule,
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
  // Kept at 12MB globally — every other write route (~88 of them) should stay bounded by this. The
  // one route that genuinely needs more (`POST /api/v1/import`, a whole novel bundle) overrides it
  // per-route via `bodyLimit` on `@HttpRoute` (see `NovelImportController`), which `@shadow-library/fastify`
  // forwards straight through to Fastify's native per-route `bodyLimit` — no global blowup needed.
  bodyLimit: 12 * 1024 * 1024,
  transformers: CUSTOM_DATA_TRANSFORMERS,
});
