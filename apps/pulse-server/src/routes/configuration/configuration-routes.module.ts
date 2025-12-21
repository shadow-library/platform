/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { ConfigurationModule } from '@modules/configuration';

import { SenderAssignmentController } from './sender-assignment.controller';
import { SenderEndpointController } from './sender-endpoint.controller';
import { SenderProfileController } from './sender-profile.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [ConfigurationModule],
  controllers: [SenderProfileController, SenderEndpointController, SenderAssignmentController],
})
export class ConfigurationRoutesModule {}
