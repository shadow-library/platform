/**
 * Importing npm packages
 */
import { RequireElevation, RequireScope } from '@shadow-library/auth/module';
import { Get, HttpController, HttpStatus, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AllowDuringDeletion } from '@modules/auth';

import { DeletionStatusDto } from './deletion.dto';
import { DeletionService } from './deletion.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The one destructive surface (ARCHITECTURE §4.4, §21). `@RequireElevation()` and
 * `@RequireScope('memoir:destructive')` merge into one route metadata entry, so an `AAL1` caller is
 * answered `IAM_003` (browser: bounced through step-up by the SDK) and a caller without the sensitive
 * scope is refused outright. `@AllowDuringDeletion()` exempts only this controller from the `ACC_002`
 * refusal the marker imposes everywhere else — a started deletion still has to be observable, and a
 * repeat start has to answer with the state already in flight.
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
