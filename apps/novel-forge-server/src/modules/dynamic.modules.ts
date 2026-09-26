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
import { ActionJobsModule } from '@modules/actions';
import { AiModule } from '@modules/ai';
import { BibleAuditModule } from '@modules/audit';
import { AppAuthModule } from '@modules/auth';
import { BibleModule } from '@modules/bible';
import { BotOwnershipModule } from '@modules/bot-ownership';
import { ChapterModule } from '@modules/chapter';
import { EventsModule } from '@modules/events';
import { ExportModule } from '@modules/export';
import { GenerationModule } from '@modules/generation';
import { HubActionsModule } from '@modules/hub';
import { IllustrationModule } from '@modules/illustration';
import { JobsModule } from '@modules/jobs';
import { LedgerModule } from '@modules/ledger';
import { NovelImportModule } from '@modules/novel-import';
import { PluginProposalModule, PluginsModule } from '@modules/plugins';
import { ProjectModule } from '@modules/project';
import { PublishingHttpModule } from '@modules/publishing/publishing-http.module';
import { RefinementModule } from '@modules/refinement';
import { ReviewModule } from '@modules/review';
import { CUSTOM_DATA_TRANSFORMERS } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const AppHttpCoreModule = HttpCoreModule.forRoot({
  openapi: { normalizeSchemaIds: true },
});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [
    AppHttpCoreModule,
    AppAuthModule,
    ActionJobsModule,
    AiModule,
    BibleAuditModule,
    BotOwnershipModule,
    ChapterModule,
    EventsModule,
    ExportModule,
    GenerationModule,
    HubActionsModule,
    IllustrationModule,
    JobsModule,
    LedgerModule,
    NovelImportModule,
    PluginsModule,
    PluginProposalModule,
    ProjectModule,
    PublishingHttpModule,
    RefinementModule,
    ReviewModule,
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
