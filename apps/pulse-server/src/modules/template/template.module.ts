/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { TemplateGroupController } from './template-group/template-group.controller';
import { TemplateGroupService } from './template-group/template-group.service';
import { TemplateSettingsService } from './template-settings.service';
import { TemplateVariantController } from './template-variant/template-variant.controller';
import { TemplateVariantService } from './template-variant/template-variant.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [TemplateGroupController, TemplateVariantController],
  providers: [TemplateGroupService, TemplateSettingsService, TemplateVariantService],
  exports: [TemplateGroupService, TemplateSettingsService, TemplateVariantService],
})
export class TemplateModule {}
