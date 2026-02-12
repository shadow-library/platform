/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
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
  imports: [DatabaseModule],
  providers: [TemplateGroupService, TemplateSettingsService, TemplateVariantService],
  exports: [TemplateGroupService, TemplateSettingsService, TemplateVariantService],
})
export class TemplateModule {}
