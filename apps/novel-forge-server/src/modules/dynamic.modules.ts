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
import { BibleModule } from '@modules/bible';
import { ExtractionModule } from '@modules/extraction';
import { GenerationModule } from '@modules/generation';
import { JobsModule } from '@modules/jobs';
import { PipelineModule } from '@modules/pipeline';
import { PlanningModule } from '@modules/planning';
import { ProjectModule } from '@modules/project';
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
  imports: [AppHttpCoreModule, AiModule, ExtractionModule, GenerationModule, JobsModule, PipelineModule, PlanningModule, ProjectModule, SourceModule, BibleModule],
  host: Config.get('server.host'),
  port: Config.get('server.port'),
  routePrefix: '/api',
  prefixVersioning: true,
  transformers: CUSTOM_DATA_TRANSFORMERS,
});
