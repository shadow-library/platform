import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { AuthoringClaimService } from './authoring-claim.service';

@Module({
  imports: [DatabaseModule],
  providers: [AuthoringClaimService],
  exports: [AuthoringClaimService],
})
export class AuthoringClaimModule {}
