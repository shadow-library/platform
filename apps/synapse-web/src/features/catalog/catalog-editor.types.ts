import { type CatalogIssueResponse } from '@/lib';

const CATALOG_TABS = ['draft', 'publish', 'versions'] as const;

export type CatalogTab = (typeof CATALOG_TABS)[number];

export interface Notice {
  intent: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body?: string;
}

export interface IssueReport {
  source: 'save' | 'validate' | 'publish' | 'rollback';
  issues: CatalogIssueResponse[];
}

export function parseCatalogTab(value: unknown): CatalogTab {
  return CATALOG_TABS.find(tab => tab === value) ?? 'draft';
}
