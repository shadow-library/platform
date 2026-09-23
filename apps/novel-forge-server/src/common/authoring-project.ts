import { AppErrorCode } from '@server/classes';
import { type Project } from '@server/database';

/**
 * The authoring-pipeline gate: generation, planning and arc outlining assume a project whose English
 * prose the forge writes. A `translation` project's prose comes from its originals and a `curated`
 * one's arrived finished, so both refuse the authoring pipeline.
 */
export function assertAuthoringProject(project: Pick<Project.Row, 'kind'>): void {
  if (project.kind === 'translation' || project.kind === 'curated') throw AppErrorCode.PRJ_009.create();
}
