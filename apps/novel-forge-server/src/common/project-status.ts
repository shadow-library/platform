import { AppErrorCode } from '@server/classes';
import { type Project } from '@server/database';

/**
 * The pipeline gate for seed projects (ideation-studio design §2.1): generation, planning, arc
 * outlining and publishing all assume a project with a bible behind it, which a seed does not have
 * until graduation.
 */
export function assertActiveProject(project: Pick<Project.Row, 'status'>): void {
  if (project.status === 'seed') throw AppErrorCode.IDE_004.create();
}

/**
 * The authoring-pipeline gate (translation design D10): generation, planning and arc outlining assume a
 * project whose English prose the forge writes. A `translation` project's prose comes from its originals
 * and a `curated` one's arrived finished, so both refuse the authoring pipeline the way a seed does.
 */
export function assertAuthoringProject(project: Pick<Project.Row, 'status' | 'kind'>): void {
  assertActiveProject(project);
  if (project.kind === 'translation' || project.kind === 'curated') throw AppErrorCode.PRJ_009.create();
}
