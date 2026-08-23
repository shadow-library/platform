import { Authenticated } from '@shadow-library/auth/module';
import { Body, HttpController, Params, Post, RespondFor } from '@shadow-library/fastify';

import { AppErrorCode } from '@server/classes';

import {
  LegacyCancelIllustrationResponse,
  LegacyIllustrationParams,
  LegacyRefineIllustrationBody,
  LegacyRefineIllustrationResponse,
  LegacySaveIllustrationResponse,
  LegacySessionBody,
  LegacyStartIllustrationBody,
  LegacyStartIllustrationResponse,
} from './illustration.dto';
import { IllustrationService } from './illustration.service';

/**
 * @deprecated The entity-scoped, single-preview session API. Every route delegates to the persistent
 * illustration subsystem under `/api/v1/projects/:projectId/illustrations`; `sessionId` is an
 * illustration id and only the first candidate is surfaced. Use the new routes for anything new.
 */
@Authenticated()
@HttpController('/api/v1/projects/:projectId/entities/:entityKey/illustration')
export class LegacyIllustrationController {
  constructor(private readonly illustrationService: IllustrationService) {}

  @Post()
  @RespondFor(200, LegacyStartIllustrationResponse)
  async startIllustration(@Params() params: LegacyIllustrationParams, @Body() body: LegacyStartIllustrationBody): Promise<LegacyStartIllustrationResponse> {
    const illustration = await this.illustrationService.start(params.projectId, { subjectType: 'entity', subjectKey: params.entityKey, instruction: body.instruction });
    return { sessionId: String(illustration.id), previewUrl: this.firstPreview(illustration.candidates) };
  }

  @Post('/refine')
  @RespondFor(200, LegacyRefineIllustrationResponse)
  async refineIllustration(@Params() params: LegacyIllustrationParams, @Body() body: LegacyRefineIllustrationBody): Promise<LegacyRefineIllustrationResponse> {
    const illustration = await this.illustrationService.refine(params.projectId, BigInt(body.sessionId), { add: body.instruction });
    return { previewUrl: this.firstPreview(illustration.candidates.slice(-2)) };
  }

  @Post('/save')
  @RespondFor(200, LegacySaveIllustrationResponse)
  async saveIllustration(@Params() params: LegacyIllustrationParams, @Body() body: LegacySessionBody): Promise<LegacySaveIllustrationResponse> {
    const id = BigInt(body.sessionId);
    const current = await this.illustrationService.select(params.projectId, id, this.lastRef(await this.illustrationService.list(params.projectId), id));
    const saved = await this.illustrationService.save(params.projectId, id, 'portrait');
    return { saved: true, imageUrl: saved.selectedUrl ?? current.candidates[0]?.imageUrl ?? '' };
  }

  @Post('/cancel')
  @RespondFor(200, LegacyCancelIllustrationResponse)
  async cancelIllustration(@Params() params: LegacyIllustrationParams, @Body() body: LegacySessionBody): Promise<LegacyCancelIllustrationResponse> {
    await this.illustrationService.discard(params.projectId, BigInt(body.sessionId));
    return { cancelled: true };
  }

  private firstPreview(candidates: { imageUrl: string }[]): string {
    const preview = candidates[0];
    if (!preview) throw AppErrorCode.AI_005.create();
    return preview.imageUrl;
  }

  private lastRef(illustrations: { id: bigint; candidates: { ref: string }[] }[], id: bigint): string {
    const illustration = illustrations.find(item => item.id === id);
    const ref = illustration?.candidates.at(-1)?.ref;
    if (!ref) throw AppErrorCode.ILL_001.create();
    return ref;
  }
}
