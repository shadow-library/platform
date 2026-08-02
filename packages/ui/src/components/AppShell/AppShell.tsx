/**
 * Importing npm packages
 */
import { Link, useRouterState } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { cn, matchPath } from '@/lib';

import { AccountMenu } from '../AccountMenu';
import { Badge } from '../Badge';
import { Shell } from '../Shell';
import { Sidebar } from '../Sidebar';
import { TopNavigation } from '../TopNavigation';
import styles from './AppShell.module.css';
import { type AppShellBrand, type AppShellProps, type NavBranch, type NavLeaf, type NavNode, type NavSection } from './AppShell.types';

/**
 * Declaring the constants
 */
function ExternalIcon(): ReactElement {
  return (
    <svg className={styles.externalIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 3.5H3.5v9h9v-3" />
      <path d="M9.5 3.5h3v3M12.5 3.5 7 9" />
    </svg>
  );
}

function isBranch(node: NavNode): node is NavBranch {
  return 'items' in node;
}

/** Substitutes `$param` segments so a template path can be compared against the live pathname. */
function resolvePath(to: string, params?: Record<string, string>): string {
  if (params == null) return to;
  return Object.entries(params).reduce((path, [key, value]) => path.replaceAll(`$${key}`, value), to);
}

function isLeafActive(pathname: string, leaf: NavLeaf): boolean {
  if (leaf.external) return false;
  return matchPath(pathname, resolvePath(leaf.to, leaf.params), { exact: leaf.exact });
}

function visible<T extends { hidden?: boolean }>(entries: T[]): T[] {
  return entries.filter(entry => entry.hidden !== true);
}

/** A count of zero is absence, not a number worth drawing. */
function renderBadge(leaf: NavLeaf): ReactNode {
  if (leaf.badge == null || leaf.badge.count <= 0) return null;
  return (
    <Badge variant="count" intent={leaf.badge.intent ?? 'neutral'}>
      {leaf.badge.count}
    </Badge>
  );
}

function NavLeafItem({ leaf }: { leaf: NavLeaf }): ReactElement {
  if (leaf.external) {
    return (
      <Sidebar.Item asChild icon={leaf.icon} badge={renderBadge(leaf)} label={leaf.label}>
        <a href={leaf.to} target="_blank" rel="noreferrer">
          {leaf.label}
          <ExternalIcon />
        </a>
      </Sidebar.Item>
    );
  }
  // No `active` prop: the router link marks itself, and `Sidebar.Item` already keys its treatment off
  // `data-status="active"`. Computing it here as well would fight the link over `aria-current`.
  return (
    <Sidebar.Item asChild icon={leaf.icon} badge={renderBadge(leaf)} label={leaf.label}>
      <Link to={leaf.to} params={leaf.params} activeOptions={{ exact: leaf.exact ?? false }} activeProps={{ 'aria-current': 'page' }}>
        {leaf.label}
      </Link>
    </Sidebar.Item>
  );
}

function NavNodeItem({ node, pathname }: { node: NavNode; pathname: string }): ReactElement {
  if (!isBranch(node)) return <NavLeafItem leaf={node} />;
  const children = visible(node.items);
  // A branch opens itself when it owns the current route, so a deep link never lands on a collapsed group.
  const active = children.some(leaf => isLeafActive(pathname, leaf));
  return (
    <Sidebar.Group label={node.label} icon={node.icon} active={active} defaultOpen={active}>
      {children.map(leaf => (
        <NavLeafItem key={leaf.to} leaf={leaf} />
      ))}
    </Sidebar.Group>
  );
}

function BrandMark({ brand, tone }: { brand: AppShellBrand; tone: 'default' | 'warning' }): ReactElement {
  const content = (
    <>
      {brand.icon != null ? <span className={styles.brandIcon}>{brand.icon}</span> : null}
      <span className={styles.brandText}>
        <span className={styles.brandName}>{brand.name}</span>
        {brand.tagline != null ? (
          <span className={styles.brandTagline} data-tone={tone}>
            {brand.tagline}
          </span>
        ) : null}
      </span>
    </>
  );
  if (brand.to == null) return <span className={styles.brand}>{content}</span>;
  return (
    <Link to={brand.to} className={styles.brand}>
      {content}
    </Link>
  );
}

/**
 * The whole application frame, rendered from a declaration rather than assembled by hand. A product says
 * what its destinations are; this decides how they look, where identity lives, and how the frame behaves
 * on a phone — so four products cannot drift into four different shells.
 *
 * Identity is deliberately confined to the top bar's account menu. There is no sidebar identity slot: one
 * of the two copies always goes stale, and on a phone the footer costs the drawer its most reachable row.
 * `sidebarFooter` exists for progress and context, and refusing to accept a user there is the point.
 *
 * Composes `Shell`, so the mobile drawer, gutters, reading column, skip link, and safe-area handling are
 * inherited rather than restated.
 */
export function AppShell({
  brand,
  nav,
  account,
  tone = 'default',
  breadcrumb,
  search,
  status,
  actions,
  utility,
  sidebarFooter,
  collapsible = false,
  storageKey,
  bottomNav,
  contentWidth,
  contentPadding,
  className,
  children,
}: AppShellProps): ReactElement {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const sections: NavSection[] = visible(nav.sections);

  const sidebar = (
    <Sidebar
      aria-label="Main"
      workspace={<BrandMark brand={brand} tone={tone} />}
      footer={sidebarFooter}
      defaultCollapsed={collapsible || storageKey != null ? false : undefined}
      storageKey={storageKey}
    >
      {nav.variant === 'project' ? (
        <Sidebar.Switcher
          current={nav.project.current}
          options={nav.project.options}
          emptyLabel={nav.project.emptyLabel}
          menuLabel={nav.project.menuLabel}
          loading={nav.project.loading}
          onSelect={nav.project.onSelect}
          footerAction={nav.project.footerAction}
        />
      ) : null}
      {sections.map((section, index) => (
        <Sidebar.Section key={section.label ?? `section-${index}`} label={section.label}>
          {visible(section.items).map(node => (
            <NavNodeItem key={isBranch(node) ? node.label : node.to} node={node} pathname={pathname} />
          ))}
        </Sidebar.Section>
      ))}
    </Sidebar>
  );

  const topbar = (
    <TopNavigation
      aria-label="Top"
      brand={breadcrumb != null ? <div className={styles.breadcrumb}>{breadcrumb}</div> : undefined}
      search={search}
      utility={
        <>
          {status != null ? <span className={styles.status}>{status}</span> : null}
          {actions}
          {utility}
          <AccountMenu {...account} />
        </>
      }
    />
  );

  return (
    <Shell sidebar={sidebar} topbar={topbar} bottomNav={bottomNav} contentWidth={contentWidth} contentPadding={contentPadding} className={cn(styles.root, className)}>
      {children}
    </Shell>
  );
}
