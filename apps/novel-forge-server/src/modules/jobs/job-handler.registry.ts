import { Injectable } from '@shadow-library/app';

import { type Job } from '@server/database';

export type JobHandler = (job: Job.Row) => Promise<void>;

/**
 * The job kinds other modules run. It has no dependencies and its module no imports, so the container builds it before any module that
 * registers into it: every feature module sits in one cycle through FastifyModule, and that cycle's tie-break order can initialise a module
 * before the ones it imports.
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<Job.Kind, JobHandler>();

  register(kind: Job.Kind, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  has(kind: Job.Kind): boolean {
    return this.handlers.has(kind);
  }

  get(kind: Job.Kind): JobHandler | undefined {
    return this.handlers.get(kind);
  }
}
