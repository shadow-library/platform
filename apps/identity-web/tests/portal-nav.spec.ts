import { describe, expect, it } from 'bun:test';
import { type NavConfig, type NavLeaf } from '@shadow-library/ui/router';

import { type MyOrganisation } from '../src/lib/apis';
import { orgCaption, orgNavConfig, type OrgNavOptions } from '../src/features/portal/org-nav';
import { accountCrumbs, type CrumbLeaf, matchLeaf, orgCrumbs } from '../src/features/portal/portal-crumbs';

const TEAM: MyOrganisation = {
  id: 'org-1',
  slug: 'shadow-platform',
  name: 'Shadow Platform',
  type: 'TEAM',
  status: 'ACTIVE',
  role: 'OWNER',
  isDefault: false,
  joinedAt: '2026-01-01T00:00:00.000Z',
};
const PERSONAL: MyOrganisation = { ...TEAM, id: 'org-2', slug: 'personal', name: 'Personal workspace', type: 'PERSONAL', isDefault: true };
const NOOP = (): void => undefined;

function navFor(options: Partial<OrgNavOptions> = {}): NavConfig {
  return orgNavConfig({ orgId: TEAM.id, org: TEAM, canManage: true, organisations: [TEAM, PERSONAL], loading: false, onSelect: NOOP, onShowAll: NOOP, ...options });
}

function leaves(nav: NavConfig): NavLeaf[] {
  return nav.sections.flatMap(section => section.items).flatMap(node => ('items' in node ? [] : [node]));
}

function visibleLabels(nav: NavConfig): string[] {
  return leaves(nav)
    .filter(leaf => leaf.hidden !== true)
    .map(leaf => leaf.label);
}

describe('orgNavConfig', () => {
  it('should show every org page to a team manager', () => {
    expect(visibleLabels(navFor())).toEqual(['Overview', 'Members', 'Applications', 'Bots', 'Settings', 'Domains', 'Single sign-on', 'Security policies', 'Back to my account']);
  });

  it('should hide manager-only pages from a team member', () => {
    expect(visibleLabels(navFor({ org: { ...TEAM, role: 'MEMBER' }, canManage: false }))).toEqual(['Overview', 'Members', 'Settings', 'Domains', 'Back to my account']);
  });

  it('should hide team-only and manager-only pages in a personal workspace', () => {
    expect(visibleLabels(navFor({ orgId: PERSONAL.id, org: PERSONAL, canManage: false }))).toEqual(['Overview', 'Members', 'Settings', 'Back to my account']);
  });

  it('should hide gated pages while the organization is unknown', () => {
    expect(visibleLabels(navFor({ org: null, canManage: false }))).toEqual(['Overview', 'Members', 'Settings', 'Back to my account']);
  });

  it('should match the overview exactly and fill every org route with the org id', () => {
    const nav = navFor();
    const [overview] = leaves(nav);
    expect(overview?.exact).toBe(true);
    expect(leaves(nav).every(leaf => leaf.to === '/account' || leaf.params?.orgId === TEAM.id)).toBe(true);
  });

  it('should describe the current org and offer every org in the switcher', () => {
    const nav = navFor();
    if (nav.variant !== 'project') throw new TypeError('expected a project nav');
    expect(nav.project.current).toEqual({ id: TEAM.id, label: 'Shadow Platform', caption: 'Owner · Team' });
    expect(nav.project.options.map(option => option.caption)).toEqual(['Owner · Team', 'Owner · Personal']);
    expect(nav.project.menuLabel).toBe('Switch organization');
    expect(nav.project.footerAction?.label).toBe('All organizations');
  });

  it('should leave the switcher empty when the org is not in the list', () => {
    const nav = navFor({ org: null });
    if (nav.variant !== 'project') throw new TypeError('expected a project nav');
    expect(nav.project.current).toBeUndefined();
  });

  it('should caption an org with its role and type', () => {
    expect(orgCaption({ ...TEAM, role: 'ADMIN' })).toBe('Admin · Team');
  });
});

describe('matchLeaf', () => {
  it('should prefer an exact leaf only on its own path and prefix-match the rest by segment', () => {
    const nav = navFor();
    expect(matchLeaf(leaves(nav), '/organizations/org-1')?.label).toBe('Overview');
    expect(matchLeaf(leaves(nav), '/organizations/org-1/')?.label).toBe('Overview');
    expect(matchLeaf(leaves(nav), '/organizations/org-1/bots/bot-9')?.label).toBe('Bots');
    expect(matchLeaf(leaves(nav), '/organizations/org-1/botsx')).toBeUndefined();
  });
});

describe('orgCrumbs', () => {
  const crumbs = (pathname: string, leaf?: CrumbLeaf): ReturnType<typeof orgCrumbs> => orgCrumbs({ nav: navFor(), orgId: TEAM.id, orgName: TEAM.name, pathname, leaf });
  const overviewLink = { kind: 'link', label: 'Shadow Platform', to: '/organizations/$orgId', params: { orgId: TEAM.id } };

  it('should show only the org name on the overview', () => {
    expect(crumbs('/organizations/org-1')).toEqual([{ kind: 'current', label: 'Shadow Platform' }]);
  });

  it('should link the org name to the overview on a section page', () => {
    expect(crumbs('/organizations/org-1/providers')).toEqual([overviewLink, { kind: 'current', label: 'Single sign-on' }]);
  });

  it('should link the section and end on the leaf a detail page contributes', () => {
    expect(crumbs('/organizations/org-1/bots/bot-9', { pathname: '/organizations/org-1/bots/bot-9', label: 'webnovel-ingest' })).toEqual([
      overviewLink,
      { kind: 'link', label: 'Bots', to: '/organizations/$orgId/bots', params: { orgId: TEAM.id } },
      { kind: 'current', label: 'webnovel-ingest' },
    ]);
  });

  it('should end on the section while a detail page has no leaf yet', () => {
    expect(crumbs('/organizations/org-1/bots/bot-9')).toEqual([overviewLink, { kind: 'current', label: 'Bots' }]);
  });

  it('should ignore a leaf set on another pathname', () => {
    expect(crumbs('/organizations/org-1/members', { pathname: '/organizations/org-1/bots/bot-9', label: 'webnovel-ingest' })).toEqual([
      overviewLink,
      { kind: 'current', label: 'Members' },
    ]);
  });

  it('should still name a section the sidebar hides', () => {
    const nav = navFor({ orgId: PERSONAL.id, org: PERSONAL, canManage: false });
    const trail = orgCrumbs({ nav, orgId: PERSONAL.id, orgName: PERSONAL.name, pathname: '/organizations/org-2/bots' });
    expect(trail.at(-1)).toEqual({ kind: 'current', label: 'Bots' });
  });
});

describe('accountCrumbs', () => {
  const nav: NavConfig = {
    variant: 'sections',
    sections: [
      {
        label: 'Account',
        items: [
          { to: '/account', label: 'Overview', exact: true },
          { to: '/account/security', label: 'Security' },
        ],
      },
      { label: 'Platform', hidden: true, items: [{ to: '/console', label: 'Admin console' }] },
    ],
  };

  it('should link the account root and end on the active leaf', () => {
    expect(accountCrumbs(nav, '/account/security/passkeys')).toEqual([
      { kind: 'link', label: 'Account', to: '/account' },
      { kind: 'current', label: 'Security' },
    ]);
    expect(accountCrumbs(nav, '/account').at(-1)).toEqual({ kind: 'current', label: 'Overview' });
  });

  it('should ignore leaves in hidden sections', () => {
    expect(accountCrumbs(nav, '/console')).toEqual([{ kind: 'current', label: 'Account' }]);
  });
});
