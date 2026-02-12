/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { SenderEndpointService } from './sender-endpoint.service';
import { SenderProfileService } from './sender-profile.service';
import { SenderRoutingRuleService } from './sender-routing-rule.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  providers: [SenderProfileService, SenderEndpointService, SenderRoutingRuleService],
  exports: [SenderProfileService, SenderEndpointService, SenderRoutingRuleService],
})
export class ConfigurationModule {}
