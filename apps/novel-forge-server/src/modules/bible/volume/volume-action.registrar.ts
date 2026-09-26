import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

import { ActionExecutorRegistry } from '@modules/refinement';

import { VolumeService } from './volume.service';

/** Wires the author's "goal met — start next" click to `VolumeService`, the way `ActionJobService` wires organise/plan actions from within their own module. */
@Injectable()
export class VolumeActionRegistrar {
  constructor(
    private readonly registry: ActionExecutorRegistry,
    private readonly volumeService: VolumeService,
  ) {}

  onModuleInit(): void {
    this.registry.register('action.advance_volume', async (projectId, action) => {
      if (action.op !== 'action.advance_volume') throw AppError.internal('executor misrouted');
      const { completed, activated } = await this.volumeService.advanceGoalMet(projectId, action.volumeKey);
      const summary = activated
        ? `volume ${completed.volumeKey}'s goal is met — volume ${activated.volumeKey} is now active`
        : `volume ${completed.volumeKey}'s goal is met — no later volume is planned yet`;
      return { summary };
    });
  }
}
