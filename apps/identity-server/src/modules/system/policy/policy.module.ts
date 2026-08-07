import { Module } from '@shadow-library/app';

import { AuditModule } from '@server/modules/infrastructure/audit';
import { DatabaseModule } from '@server/modules/infrastructure/datastore';

import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [PolicyController],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
