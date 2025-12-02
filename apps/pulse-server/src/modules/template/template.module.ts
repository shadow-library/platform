/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatastoreModule } from '../datastore';
import { TemplateGroupService } from './template-group.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatastoreModule],
  providers: [TemplateGroupService],
  exports: [TemplateGroupService],
})
export class TemplateModule {}
