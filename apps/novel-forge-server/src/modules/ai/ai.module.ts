/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { CatalogService } from './context/catalog.service';
import { ContextAssembler } from './context/context-assembler.service';
import { ModelRouterService } from './model-router.service';
import { EmbeddingService } from './retrieval/embedding.service';
import { IndexingService } from './retrieval/indexing.service';
import { RetrievalService } from './retrieval/retrieval.service';
import { TelemetryHandler } from './telemetry.handler';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [TelemetryHandler, ModelRouterService, EmbeddingService, IndexingService, RetrievalService, CatalogService, ContextAssembler],
  exports: [ModelRouterService, TelemetryHandler, EmbeddingService, IndexingService, RetrievalService, CatalogService, ContextAssembler],
})
export class AiModule {}
