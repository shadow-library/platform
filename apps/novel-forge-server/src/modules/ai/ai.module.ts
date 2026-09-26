import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';
import { DatabaseModule } from '@shadow-library/modules';

import { ActorModule } from '@modules/actor';

import { EventsModule } from '../events/events.module';
import { PluginsModule } from '../plugins/plugins.module';
import { AccountSettingsService } from './account-settings.service';
import { AppearanceDescriberService } from './appearance-describer.service';
import { AiController } from './ai.controller';
import { AiQuotaService } from './ai-quota.service';
import { AiUsageService } from './ai-usage.service';
import { CatalogService } from './context/catalog.service';
import { ContextAssembler } from './context/context-assembler.service';
import { WorkflowRunService } from './graphs/workflow-run.service';
import { ModelCatalogService } from './model-catalog.service';
import { ModelRouterService } from './model-router.service';
import { ProjectAiController } from './project-ai.controller';
import { EmbeddingService } from './retrieval/embedding.service';
import { IndexingService } from './retrieval/indexing.service';
import { RetrievalService } from './retrieval/retrieval.service';
import { TelemetryHandler } from './telemetry.handler';
import { ToolRegistryService } from './tools/tool-registry.service';

@Module({
  imports: [ActorModule, DatabaseModule, EventsModule, FastifyModule, PluginsModule],
  controllers: [AiController, ProjectAiController],
  providers: [
    AccountSettingsService,
    TelemetryHandler,
    ModelRouterService,
    ModelCatalogService,
    AiQuotaService,
    AiUsageService,
    AppearanceDescriberService,
    EmbeddingService,
    IndexingService,
    RetrievalService,
    CatalogService,
    ContextAssembler,
    ToolRegistryService,
    WorkflowRunService,
  ],
  exports: [
    AccountSettingsService,
    ModelRouterService,
    AiQuotaService,
    AiUsageService,
    AppearanceDescriberService,
    TelemetryHandler,
    EmbeddingService,
    IndexingService,
    RetrievalService,
    CatalogService,
    ContextAssembler,
    ToolRegistryService,
    WorkflowRunService,
  ],
})
export class AiModule {}
