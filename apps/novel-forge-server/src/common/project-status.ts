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
