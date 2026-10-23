import { RequireElevation, RequireScope } from '@shadow-library/auth/module';
import { Get, HttpController, HttpStatus, Post, RespondFor } from '@shadow-library/fastify';

import { AllowDuringDeletion } from '@modules/auth';

import { DeletionStatusDto } from './deletion.dto';
import { DeletionService } from './deletion.service';

/**
 * The one destructive surface. `@RequireElevation()` and `@RequireScope('memoir:destructive')` merge into one route metadata entry: an `AAL1`
 * caller gets `IAM_003`, a caller without the scope is refused.
 * `@AllowDuringDeletion()` exempts only this controller from `ACC_002`, so a started deletion stays observable and a repeat start answers with the state in flight.
 */
@HttpController('/api/v1/account/deletion')
@RequireElevation()
@RequireScope('memoir:destructive')
@AllowDuringDeletion()
export class DeletionController {
  constructor(private readonly deletionService: DeletionService) {}

  @Post()
  @HttpStatus(202)
  @RespondFor(202, DeletionStatusDto)
  async start(): Promise<DeletionStatusDto> {
    return { deletionState: await this.deletionService.start() };
  }

  @Get()
  @RespondFor(200, DeletionStatusDto)
  async status(): Promise<DeletionStatusDto> {
    return { deletionState: await this.deletionService.status() };
  }
}
