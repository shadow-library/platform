import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type ProjectEvent, type ProjectEventListener } from './project-events.types';

/**
 * In-process fan-out, which is only correct while one replica does all the work: a subscriber connected to one
 * process never hears a publish from another. A second replica or a separate worker is the point to move this onto
 * Postgres LISTEN/NOTIFY — callers keep publishing and subscribing exactly as they do now.
 */
@Injectable()
export class ProjectEventService {
  private readonly logger = Logger.getLogger(APP_NAME, ProjectEventService.name);
  private readonly listeners = new Map<bigint, Set<ProjectEventListener>>();

  /** Publish only once the write it describes has committed: a subscriber refetches as soon as it hears it. */
  publish(projectId: bigint, event: ProjectEvent): void {
    for (const listener of this.listeners.get(projectId) ?? []) {
      // A broken subscriber must not fail the run or job whose state change it was being told about.
      try {
        listener(event);
      } catch (err) {
        this.logger.warn('project event listener failed', { projectId, event, err });
      }
    }
  }

  subscribe(projectId: bigint, listener: ProjectEventListener): () => void {
    const listeners = this.listeners.get(projectId) ?? new Set<ProjectEventListener>();
    this.listeners.set(projectId, listeners.add(listener));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && this.listeners.get(projectId) === listeners) this.listeners.delete(projectId);
    };
  }
}
