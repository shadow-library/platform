import { matchPath } from '@shadow-library/ui';
import { type NavConfig, type NavLeaf } from '@shadow-library/ui/router';

import { ORG_OVERVIEW_PATH } from './org-nav';

export interface CrumbLink {
  kind: 'link';
  label: string;
  to: string;
  params?: Record<string, string>;
}

export interface CrumbCurrent {
  kind: 'current';
  label: string;
}

export type Crumb = CrumbLink | CrumbCurrent;

export interface CrumbLeaf {
  pathname: string;
  label: string;
}

interface CrumbTarget {
  label: string;
  to?: string;
  params?: Record<string, string>;
}

export interface OrgCrumbsOptions {
  nav: NavConfig;
  orgId: string;
  orgName: string;
  pathname: string;
  leaf?: CrumbLeaf;
}

function resolvePath(to: string, params?: Record<string, string>): string {
  if (params == null) return to;
  return Object.entries(params).reduce((path, [key, value]) => path.replaceAll(`$${key}`, value), to);
}

function leavesOf(nav: NavConfig, { includeHidden }: { includeHidden: boolean }): NavLeaf[] {
  const sections = includeHidden ? nav.sections : nav.sections.filter(section => section.hidden !== true);
  return sections.flatMap(section => section.items).flatMap(node => ('items' in node ? [] : [node]));
}

export function matchLeaf(leaves: NavLeaf[], pathname: string): NavLeaf | undefined {
  const matches = leaves.filter(leaf => matchPath(pathname, resolvePath(leaf.to, leaf.params), { exact: leaf.exact }));
  return matches.sort((a, b) => resolvePath(b.to, b.params).length - resolvePath(a.to, a.params).length)[0];
}

function trail(targets: CrumbTarget[]): Crumb[] {
  return targets.map((target, index): Crumb => {
    if (index === targets.length - 1 || target.to == null) return { kind: 'current', label: target.label };
    return { kind: 'link', label: target.label, to: target.to, params: target.params };
  });
}

export function accountCrumbs(nav: NavConfig, pathname: string): Crumb[] {
  const root: CrumbTarget = { label: 'Account', to: '/account' };
  const leaf = matchLeaf(leavesOf(nav, { includeHidden: false }), pathname);
  return trail(leaf == null ? [root] : [root, { label: leaf.label }]);
}

export function orgCrumbs({ nav, orgId, orgName, pathname, leaf }: OrgCrumbsOptions): Crumb[] {
  const params = { orgId };
  const targets: CrumbTarget[] = [{ label: orgName, to: ORG_OVERVIEW_PATH, params }];
  const section = matchLeaf(leavesOf(nav, { includeHidden: true }), pathname);
  if (section != null && section.to !== ORG_OVERVIEW_PATH) targets.push({ label: section.label, to: section.to, params: section.params });
  if (leaf != null && leaf.label !== '' && matchPath(pathname, leaf.pathname, { exact: true })) targets.push({ label: leaf.label });
  return trail(targets);
}
