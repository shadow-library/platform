import { type CatalogChange, type CatalogDocument, type ChangeArea, issueOwner, issueSentence } from '@/features/catalog';
import { type CatalogIssueResponse, type CatalogVersionSummaryResponse } from '@/lib';

export interface ChangeGroup {
  area: ChangeArea;
  title: string;
  changes: CatalogChange[];
}

export interface RollbackIssueRow {
  key: string;
  sentence: string;
  path: string;
  owner?: string;
}

const AREA_ORDER: readonly ChangeArea[] = ['task', 'alias', 'model', 'provider', 'budget', 'other'];

const AREA_TITLES: Readonly<Record<ChangeArea, string>> = {
  task: 'Features',
  alias: 'Model names',
  model: 'Models',
  provider: 'Providers',
  budget: 'Budgets',
  other: 'Other settings',
};

export function listVersions(versions: readonly CatalogVersionSummaryResponse[]): CatalogVersionSummaryResponse[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

export function predecessorOf(versions: readonly CatalogVersionSummaryResponse[], version: number): number | null {
  const lower = listVersions(versions).filter(candidate => candidate.version < version);
  return lower[0]?.version ?? null;
}

export function groupChanges(changes: readonly CatalogChange[]): ChangeGroup[] {
  return AREA_ORDER.map(area => ({ area, title: AREA_TITLES[area], changes: changes.filter(change => change.area === area) })).filter(group => group.changes.length > 0);
}

export function rollbackIssueRows(issues: readonly CatalogIssueResponse[], document: CatalogDocument | null): RollbackIssueRow[] {
  return issues.map((issue, index) => ({
    key: `${index}:${issue.path}:${issue.code}`,
    sentence: issueSentence(issue),
    path: issue.path,
    owner: document ? issueOwner(issue.path, document)?.entityKey : undefined,
  }));
}

export function rollbackDescription(version: number): string {
  return `Version ${version}'s settings become live for every app as a new version. Every change since stays in History.`;
}
