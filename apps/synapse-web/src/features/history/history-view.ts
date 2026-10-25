import { type ChangeResult, type RestoreTarget } from '@/features/changes/change-notices';
import { type IssueNotice } from '@/features/shared/issue-notice';
import { type CatalogVersionSummaryResponse } from '@/lib/apis/api-types.gen';

export interface VersionAccess {
  activeVersion: number | undefined;
  predecessor: number | null;
  canWrite: boolean;
}

/** synapse-server's note on a rollback version. */
const ROLLBACK_NOTE = /^Rollback to v(\d+)$/;

export function listVersions(versions: readonly CatalogVersionSummaryResponse[]): CatalogVersionSummaryResponse[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

export function predecessorOf(versions: readonly CatalogVersionSummaryResponse[], version: number): number | null {
  const lower = listVersions(versions).filter(candidate => candidate.version < version);
  return lower[0]?.version ?? null;
}

export function versionNote(note: string | undefined): string | undefined {
  const rollback = note?.match(ROLLBACK_NOTE);
  return rollback ? `Restored version ${rollback[1]}` : note;
}

/** The live version offers Undo back to the one before it; every older version offers to be restored. */
export function restoreTargetOf(version: number, { activeVersion, predecessor, canWrite }: VersionAccess): RestoreTarget | null {
  if (!canWrite || activeVersion === undefined) return null;
  if (version !== activeVersion) return { kind: 'restore', version, expectedLive: activeVersion };
  return predecessor === null ? null : { kind: 'undo', version: predecessor, expectedLive: activeVersion };
}

export function restoreResultNotice(result: ChangeResult, target: RestoreTarget): IssueNotice | null {
  const failed = target.kind === 'undo' ? `Version ${target.expectedLive} wasn't undone` : `Version ${target.version} wasn't restored`;
  switch (result.kind) {
    case 'applied':
    case 'alreadyLive':
    case 'cancelled':
      return null;
    case 'unchanged':
      return { intent: 'info', title: 'Nothing to restore', body: `Version ${target.version}'s settings are already live.` };
    case 'conflict':
      return {
        intent: 'warning',
        title: 'Someone else changed the catalog meanwhile',
        body: 'Nothing was changed. History now shows the latest version; check it and try again.',
      };
    case 'invalid':
      return { intent: 'danger', title: failed, body: `Version ${target.version}'s settings no longer pass the catalog checks:`, issues: result.issues };
    case 'refused':
      return { intent: 'danger', title: failed, body: result.reason };
    case 'failed':
      return { intent: 'danger', title: failed, body: result.message };
  }
}
