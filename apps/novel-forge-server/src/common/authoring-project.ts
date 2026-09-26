import { AppErrorCode } from '@server/classes';
import { type Project } from '@server/database';

/** A `curated` project's prose arrived finished, so it refuses the authoring pipeline. */
export function assertAuthoringProject(project: Pick<Project.Row, 'kind'>): void {
  if (project.kind === 'curated') throw AppErrorCode.PRJ_009.create();
}
