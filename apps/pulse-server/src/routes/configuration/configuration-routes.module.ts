/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { ConfigurationModule } from '@modules/configuration';

import { SenderEndpointController } from './sender-endpoint.controller';
import { SenderProfileController } from './sender-profile.controller';
import { SenderRoutingRuleController } from './sender-routing-rule.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [ConfigurationModule],
  controllers: [SenderProfileController, SenderEndpointController, SenderRoutingRuleController],
})
export class ConfigurationRoutesModule {}
