/**
 * Importing npm packages
 */
import { Body, Delete, Get, HttpController, HttpStatus, Params, Patch, Post, Query, RespondFor, ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { TemplateVariantService } from '@modules/template';
import { AppErrorCode } from '@server/classes';

import {
  CreateTemplateVariantBody,
  ListTemplateVariantQuery,
  ListTemplateVariantResponse,
  TemplateGroupParams,
  TemplateVariantParams,
  TemplateVariantResponse,
  UpdateTemplateVariantBody,
} from './dtos';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/template-groups/:groupId/variants')
export class TemplateVariantController {
  constructor(private readonly templateVariantService: TemplateVariantService) {}

  @Get()
  @RespondFor(200, ListTemplateVariantResponse)
  listTemplateVariants(@Params() params: TemplateGroupParams, @Query() filter: ListTemplateVariantQuery): Promise<ListTemplateVariantResponse> {
    return this.templateVariantService.listTemplateVariants(params.groupId, filter);
  }

  @Post()
  @RespondFor(201, TemplateVariantResponse)
  createTemplateVariant(@Params() params: TemplateGroupParams, @Body() body: CreateTemplateVariantBody): Promise<TemplateVariantResponse> {
    return this.templateVariantService.addTemplateVariant(params.groupId, body);
  }

  @Get('/:variantId')
  @RespondFor(200, TemplateVariantResponse)
  async getTemplateVariant(@Params() params: TemplateVariantParams): Promise<TemplateVariantResponse> {
    const templateVariant = await this.templateVariantService.getTemplateVariantById(params.groupId, params.variantId);
    if (!templateVariant) throw new ServerError(AppErrorCode.TPL_VRT_001);
    return templateVariant;
  }

  @Patch('/:variantId')
  @RespondFor(200, TemplateVariantResponse)
  updateTemplateVariant(@Params() params: TemplateVariantParams, @Body() body: UpdateTemplateVariantBody): Promise<TemplateVariantResponse> {
    return this.templateVariantService.updateTemplateVariant(params.groupId, params.variantId, body);
  }

  @Delete('/:variantId')
  @HttpStatus(204)
  deleteTemplateVariant(@Params() params: TemplateVariantParams): Promise<void> {
    return this.templateVariantService.deleteTemplateVariant(params.groupId, params.variantId);
  }
}
