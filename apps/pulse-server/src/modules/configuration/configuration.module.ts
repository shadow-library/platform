import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

import { SenderEndpointController } from './sender-endpoint/sender-endpoint.controller';
import { SenderEndpointService } from './sender-endpoint/sender-endpoint.service';
import { SenderProfileController } from './sender-profile/sender-profile.controller';
import { SenderProfileService } from './sender-profile/sender-profile.service';
import { SenderRoutingRuleController } from './sender-routing-rule/sender-routing-rule.controller';
import { SenderRoutingRuleService } from './sender-routing-rule/sender-routing-rule.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SenderProfileController, SenderEndpointController, SenderRoutingRuleController],
  providers: [SenderProfileService, SenderEndpointService, SenderRoutingRuleService],
  exports: [SenderProfileService, SenderEndpointService, SenderRoutingRuleService],
})
export class ConfigurationModule {}
