/**
 * Importing npm packages
 */
import { RequirePermission } from '@shadow-library/auth/module';
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PULSE_PERMISSIONS } from '@modules/auth';
import { TemplateVariantService } from '@modules/template';
import { AppErrorCode } from '@server/classes';

import { TemplateGroupParams } from '../template-group/template-group.dto';
import {
  CreateTemplateVariantBody,
  ListTemplateVariantQuery,
  ListTemplateVariantResponse,
  TemplateVariantParams,
  TemplateVariantResponse,
  UpdateTemplateVariantBody,
} from './template-variant.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/template-groups/:groupId/variants')
export class TemplateVariantController {
  constructor(private readonly templateVariantService: TemplateVariantService) {}

  @Get()
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, ListTemplateVariantResponse)
  listTemplateVariants(@Params() params: TemplateGroupParams, @Query() filter: ListTemplateVariantQuery): Promise<ListTemplateVariantResponse> {
    return this.templateVariantService.listTemplateVariants(params.groupId, filter);
  }

  @Post()
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @RespondFor(201, TemplateVariantResponse)
  createTemplateVariant(@Params() params: TemplateGroupParams, @Body() body: CreateTemplateVariantBody): Promise<TemplateVariantResponse> {
    return this.templateVariantService.addTemplateVariant(params.groupId, body);
  }

  @Get('/:variantId')
  @RequirePermission(PULSE_PERMISSIONS.templatesRead)
  @RespondFor(200, TemplateVariantResponse)
  async getTemplateVariant(@Params() params: TemplateVariantParams): Promise<TemplateVariantResponse> {
    const templateVariant = await this.templateVariantService.getTemplateVariantById(params.groupId, params.variantId);
    if (!templateVariant) throw AppErrorCode.TPL_VRT_001.create();
    return templateVariant;
  }

  @Patch('/:variantId')
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @RespondFor(200, TemplateVariantResponse)
  updateTemplateVariant(@Params() params: TemplateVariantParams, @Body() body: UpdateTemplateVariantBody): Promise<TemplateVariantResponse> {
    return this.templateVariantService.updateTemplateVariant(params.groupId, params.variantId, body);
  }

  @Delete('/:variantId')
  @RequirePermission(PULSE_PERMISSIONS.templatesWrite)
  @HttpStatus(204)
  deleteTemplateVariant(@Params() params: TemplateVariantParams): Promise<void> {
    return this.templateVariantService.deleteTemplateVariant(params.groupId, params.variantId);
  }
}
