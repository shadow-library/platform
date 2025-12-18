/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { TemplateModule } from '@modules/template';

import { TemplateGroupController } from './template-group.controller';
import { TemplateVariantController } from './template-variant.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [TemplateModule],
  controllers: [TemplateGroupController, TemplateVariantController],
})
export class TemplateRoutesModule {}
