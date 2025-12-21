/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatastoreModule } from '../datastore';
import { SenderAssignmentService } from './sender-assignment.service';
import { SenderEndpointService } from './sender-endpoint.service';
import { SenderProfileService } from './sender-profile.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatastoreModule],
  providers: [SenderProfileService, SenderEndpointService, SenderAssignmentService],
  exports: [SenderProfileService, SenderEndpointService, SenderAssignmentService],
})
export class ConfigurationModule {}
