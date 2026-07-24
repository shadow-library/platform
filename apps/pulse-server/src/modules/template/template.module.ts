/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { DatabaseModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { LayoutController } from './layout.controller';
import { LayoutService } from './layout.service';
import { PartialController } from './partial.controller';
import { PartialService } from './partial.service';
import { TemplateEngineService } from './rendering/template-engine.service';
import { TemplateResolverService } from './template-resolver.service';
import { TemplateVersionController } from './template-version.controller';
import { TemplateVersionService } from './template-version.service';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [DatabaseModule],
  controllers: [TemplateController, TemplateVersionController, LayoutController, PartialController],
  providers: [TemplateEngineService, TemplateResolverService, TemplateService, TemplateVersionService, LayoutService, PartialService],
  exports: [TemplateEngineService, TemplateResolverService, TemplateService, TemplateVersionService, LayoutService, PartialService],
})
export class TemplateModule {}
