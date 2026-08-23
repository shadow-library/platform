/**
 * Importing npm packages
 */
import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Config } from '@shadow-library/common';
import { Body, Get, Header, HttpController, HttpStatus, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { type DeltaPage } from './sync.types';
import { SyncCommandBatchDto, SyncCommandBatchResponseDto, SyncDeltaQueryDto, SyncDeltaResponseDto } from './sync.dto';
import { type BatchOutcome, SyncService } from './sync.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const SYNC_EPOCH_HEADER = 'x-sync-epoch';

/**
 * The two endpoints the offline client lives on (ARCHITECTURE §12.2, §25). Both carry the sync epoch:
 * a client that sees a value different from the one its cursor was issued under discards its cursor and
 * pulls from `since=0` (§12.4), which is the escape hatch for any change that invalidates local state.
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
