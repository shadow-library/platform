import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { SyncModule } from '@modules/sync';
import { TelemetryModule } from '@server/telemetry';

import { MetricEntryRepository } from './metric-entry.repository';
import { MetricRepository } from './metric.repository';
import { MetricsCommandsService } from './metrics-commands.service';
import { MetricsDeltaSources } from './metrics-delta-sources.service';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, SyncModule, TelemetryModule],
  providers: [MetricRepository, MetricEntryRepository, MetricsCommandsService, MetricsDeltaSources],
  exports: [MetricRepository, MetricEntryRepository],
})
export class MetricsModule {}
