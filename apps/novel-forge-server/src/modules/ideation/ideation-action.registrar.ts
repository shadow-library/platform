import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { ActionExecutorRegistry } from '../refinement/action-registry';
import { GraduationService } from './graduation.service';

/**
 * The studio's half of the action registry (chat-hub design §5.3). `action.graduate_seed` never runs
 * from an auto-mode turn — the apply engine refuses it with IDE_007 — so reaching this executor always
 * means the author applied the proposal themselves.
 */
@Injectable()
export class IdeationActionRegistrar {
  private readonly logger = Logger.getLogger(APP_NAME, IdeationActionRegistrar.name);

  constructor(
    private readonly registry: ActionExecutorRegistry,
    private readonly graduationService: GraduationService,
  ) {}

  onModuleInit(): void {
    this.registry.register('action.graduate_seed', async (projectId, action) => {
      if (action.op !== 'action.graduate_seed') throw AppError.internal('executor misrouted');
      const result = await this.graduationService.graduate(projectId, { title: action.title });
      return { summary: `“${result.project.name}” started — wrote ${result.documents.join(', ')} and ${result.factKeys.length} promise fact(s)` };
    });

    this.logger.debug('ideation action executors registered');
  }
}
