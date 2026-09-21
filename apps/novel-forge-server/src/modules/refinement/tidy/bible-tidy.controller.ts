import { Authenticated, BotPermission } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

import { ApplyProposalResponse, ProposalProjectParams } from '../refinement.dto';
import { serialiseProposal } from '../serialise';
import { ApplyBibleTidyBody, type BibleTidyItem, BibleTidyPreviewResponse } from './bible-tidy.dto';
import { BibleTidyService } from './bible-tidy.service';
import { type TidyItem } from './bible-tidy';

function presentItem(item: TidyItem): BibleTidyItem {
  const base = { id: item.id, kind: item.kind, section: item.section, slug: item.slug, docTitle: item.docTitle };
  switch (item.kind) {
    case 'remove_empty':
      return base;
    case 'retitle':
      return { ...base, currentTitle: item.currentTitle ?? undefined, proposedTitle: item.proposedTitle };
    case 'split':
      return { ...base, entityKey: item.entityKey, entityName: item.entityName, entityType: item.entityType, text: item.text };
    case 'move_ai_notes':
      return { ...base, text: item.text, targetSlug: item.targetSlug };
  }
}

@BotPermission(PROJECTS_READ_PERMISSION)
@Authenticated()
@HttpController('/api/v1/projects/:projectId/bible/tidy')
export class BibleTidyController {
  constructor(private readonly bibleTidyService: BibleTidyService) {}

  @Get()
  @RespondFor(200, BibleTidyPreviewResponse)
  async previewBibleTidy(@Params() params: ProposalProjectParams): Promise<BibleTidyPreviewResponse> {
    const items = await this.bibleTidyService.preview(params.projectId);
    return { items: items.map(presentItem) };
  }

  @BotPermission(PROJECTS_WRITE_PERMISSION)
  @Post()
  @RespondFor(200, ApplyProposalResponse)
  async applyBibleTidy(@Params() params: ProposalProjectParams, @Body() body: ApplyBibleTidyBody): Promise<ApplyProposalResponse> {
    const result = await this.bibleTidyService.apply(params.projectId, body.items);
    return { ...result, proposal: serialiseProposal(result.proposal) };
  }
}
