/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { SenderEndpointController } from './sender-endpoint/sender-endpoint.controller';
import { SenderEndpointService } from './sender-endpoint/sender-endpoint.service';
import { SenderProfileController } from './sender-profile/sender-profile.controller';
import { SenderProfileService } from './sender-profile/sender-profile.service';
import { SenderRoutingRuleController } from './sender-routing-rule/sender-routing-rule.controller';
import { SenderRoutingRuleService } from './sender-routing-rule/sender-routing-rule.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [SenderProfileController, SenderEndpointController, SenderRoutingRuleController],
  providers: [SenderProfileService, SenderEndpointService, SenderRoutingRuleService],
  exports: [SenderProfileService, SenderEndpointService, SenderRoutingRuleService],
})
export class ConfigurationModule {}
