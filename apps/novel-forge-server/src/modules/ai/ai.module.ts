import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { PluginsModule } from '../plugins/plugins.module';
import { AiController } from './ai.controller';
import { AiQuotaService } from './ai-quota.service';
import { CatalogService } from './context/catalog.service';
import { ContextAssembler } from './context/context-assembler.service';
import { WorkflowRunService } from './graphs/workflow-run.service';
import { ModelRouterService } from './model-router.service';
import { EmbeddingService } from './retrieval/embedding.service';
import { IndexingService } from './retrieval/indexing.service';
import { RetrievalService } from './retrieval/retrieval.service';
import { TelemetryHandler } from './telemetry.handler';
import { ToolRegistryService } from './tools/tool-registry.service';

@Module({
  imports: [DatabaseModule, PluginsModule],
  controllers: [AiController],
  providers: [
    TelemetryHandler,
    ModelRouterService,
    AiQuotaService,
    EmbeddingService,
    IndexingService,
    RetrievalService,
    CatalogService,
    ContextAssembler,
    ToolRegistryService,
    WorkflowRunService,
  ],
  exports: [
    ModelRouterService,
    AiQuotaService,
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
