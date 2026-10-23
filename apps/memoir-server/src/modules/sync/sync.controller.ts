import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { Body, Get, Header, HttpController, HttpStatus, Post, Query, RespondFor } from '@shadow-library/fastify';

import { type DeltaPage } from './sync.types';
import { SyncCommandBatchDto, SyncCommandBatchResponseDto, SyncDeltaQueryDto, SyncDeltaResponseDto } from './sync.dto';
import { type BatchOutcome, SyncService } from './sync.service';

const SYNC_EPOCH_HEADER = 'x-sync-epoch';

/**
 * The two endpoints the offline client lives on. Both carry the sync epoch: a client seeing a different value than its cursor was issued under
 * discards the cursor and pulls from `since=0`.
 */
@HttpController('/api/v1/sync')
@Authenticated()
@RequireScope('memoir:sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('/commands')
  @HttpStatus(200)
  @Header(SYNC_EPOCH_HEADER, () => Config.get('sync.epoch'))
  @RespondFor(200, SyncCommandBatchResponseDto)
  async submitCommands(@Body() body: SyncCommandBatchDto): Promise<{ outcomes: BatchOutcome[] }> {
    const outcomes = await this.syncService.submitBatch(body.commands);
    return { outcomes };
  }

  @Get('/delta')
  @Header(SYNC_EPOCH_HEADER, () => Config.get('sync.epoch'))
  @RespondFor(200, SyncDeltaResponseDto)
  pullDelta(@Query() query: SyncDeltaQueryDto): Promise<DeltaPage> {
    return this.syncService.pullDelta({ since: query.since, domains: query.domains?.split(','), limit: query.limit });
  }
}
