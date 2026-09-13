import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { type ForgeCallPolicy } from '../plugins/plugin-policy.service';
import { ModelRouterService, type ProjectConfig } from './model-router.service';
import { appearanceDescribePrompt } from './prompts/appearance-describe.prompt';
import { type AppearanceConfidence } from './schemas/appearance-describe.schema';

export interface DescribeAppearanceRequest {
  projectId: bigint;
  project?: ProjectConfig;
  policy?: ForgeCallPolicy;
  /** The reference image as a `data:image/<type>;base64,…` URL — remote URLs are refused so the provider never fetches private assets. */
  imageDataUrl: string;
  subjectLabel: string;
  /** Free text identifying which figure in the image is the subject, e.g. "the armored man in the center". */
  note?: string;
  runId?: string;
}

export interface AppearanceDescription {
  appearance: string;
  confidence: AppearanceConfidence;
  ambiguity?: string;
}

const NO_NOTE = '(none — identify the subject yourself)';
const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,./i;

@Injectable()
export class AppearanceDescriberService {
  private readonly logger = Logger.getLogger(APP_NAME, AppearanceDescriberService.name);

  constructor(private readonly modelRouter: ModelRouterService) {}

  async describe(request: DescribeAppearanceRequest): Promise<AppearanceDescription> {
    const { projectId, project, policy, imageDataUrl, subjectLabel, runId } = request;
    if (!IMAGE_DATA_URL.test(imageDataUrl)) throw AppErrorCode.AI_012.create();
    const note = request.note?.trim() || NO_NOTE;
    const ctx = { projectId, runId, promptKey: appearanceDescribePrompt.key, promptVersion: appearanceDescribePrompt.version, role: 'vision' };
    const output = await this.modelRouter.structuredWithImage(appearanceDescribePrompt, { subjectLabel, note }, imageDataUrl, ctx, project, policy);

    const ambiguity = output.ambiguity?.trim();
    const description: AppearanceDescription = { appearance: output.appearance.trim(), confidence: output.confidence, ...(ambiguity ? { ambiguity } : {}) };
    this.logger.info('appearance described', { projectId, confidence: description.confidence, ambiguous: Boolean(ambiguity), withNote: note !== NO_NOTE });
    return description;
  }
}
