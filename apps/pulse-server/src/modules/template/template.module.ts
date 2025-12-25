/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { DatastoreModule } from '../datastore';
import { TemplateGroupService } from './template-group.service';
import { TemplateSettingsService } from './template-settings.service';
import { TemplateVariantService } from './template-variant.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatastoreModule],
  providers: [TemplateGroupService, TemplateSettingsService, TemplateVariantService],
  exports: [TemplateGroupService, TemplateSettingsService, TemplateVariantService],
})
export class TemplateModule {}
