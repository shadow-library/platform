import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { MemoirAuthModule } from '@modules/auth';
import { CommandsModule } from '@modules/commands';
import { TelemetryModule } from '@server/telemetry';

import { DeltaRepository } from './delta.repository';
import { DeltaSourceRegistry } from './delta-source.registry';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncDeltaSources } from './sync-delta-sources.service';

@Module({
  imports: [DatabaseModule, MemoirAuthModule, CommandsModule, TelemetryModule],
  controllers: [SyncController],
  providers: [DeltaSourceRegistry, DeltaRepository, SyncDeltaSources, SyncService],
  exports: [DeltaSourceRegistry, DeltaRepository],
})
export class SyncModule {}
