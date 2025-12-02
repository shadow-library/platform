/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { TemplateModule } from '@modules/template';

import { TemplateGroupController } from './template-group.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [TemplateModule],
  controllers: [TemplateGroupController],
})
export class TemplateRoutesModule {}
