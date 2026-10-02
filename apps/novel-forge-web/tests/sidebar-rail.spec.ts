import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CHAT_THREAD_PADDING,
  CHAT_THREAD_WIDTH,
  isSidebarCollapsed,
  PANEL_DOCK_MIN,
  PROGRESS_PANEL_WIDTH,
  SHELL_DESKTOP_MIN,
  SIDEBAR_EXPANDED_MIN,
  SIDEBAR_RAIL_QUERY,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_WIDTH,
  type SidebarRail,
  sidebarRailAt,
} from '../src/lib/sidebar-rail';

const UI = new URL('../../../packages/ui/src/', import.meta.url);

function read(path: string | URL): string {
  return readFileSync(path instanceof URL ? path : new URL(path, import.meta.url), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
}

function declaration(css: string, selector: string, property: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return new RegExp(`(?:^|;|\\s)${property}:\\s*([^;]+);`).exec(body)?.[1]?.trim();
}

describe('Sidebar rail threshold', () => {
  const chat = read('../src/features/chat/Chat.module.css');
  const panel = read('../src/features/chat/ProgressPanel.module.css');
  const sidebar = read(new URL('components/Sidebar/Sidebar.module.css', UI));
  const tokens = read(new URL('styles/tokens.css', UI));

  it('should take its widths from the stylesheets that draw them', () => {
    expect(declaration(chat, '.msgList', 'max-width')).toBe(`${CHAT_THREAD_WIDTH}px`);
    expect(declaration(chat, '.scroll', 'padding')?.split(' ')[1]).toBe(`${CHAT_THREAD_PADDING}px`);
    expect(declaration(panel, '.panel', 'width')).toBe(`${PROGRESS_PANEL_WIDTH}px`);
    expect(declaration(sidebar, '.root', 'width')).toBe(`${SIDEBAR_WIDTH}px`);
    expect(declaration(sidebar, '.root[data-collapsed]', 'width')).toBe(`${SIDEBAR_RAIL_WIDTH}px`);
    expect(/--sh-breakpoint-md: (\d+)px/.exec(tokens)?.[1]).toBe(String(SHELL_DESKTOP_MIN));
  });

  it('should expand the sidebar exactly where the panel can dock beside it', () => {
    expect(chat).toContain(`@container chat (min-width: ${PANEL_DOCK_MIN}px)`);
    expect(panel).toContain(`@container chat (max-width: ${PANEL_DOCK_MIN - 1}px)`);
    expect(PANEL_DOCK_MIN).toBe(1080);
    expect(SIDEBAR_EXPANDED_MIN).toBe(1334);
    expect(SIDEBAR_RAIL_QUERY).toBe('(max-width: 1333px)');
    expect(SIDEBAR_EXPANDED_MIN - 1 - SIDEBAR_RAIL_WIDTH).toBeGreaterThanOrEqual(PANEL_DOCK_MIN);
  });

  it('should hold the server-drawn sidebar at the rail width across the same band until hydration', () => {
    const guard = read('../src/components/Layout/SidebarRail.module.css');
    expect(guard).toContain(`@media (min-width: ${SHELL_DESKTOP_MIN}px) and (max-width: ${SIDEBAR_EXPANDED_MIN - 1}px)`);
    expect(declaration(guard, ".pending :global(nav[aria-label='Main'])", 'width')).toBe(`${SIDEBAR_RAIL_WIDTH}px`);
    expect(declaration(guard, ".pending :global(nav[aria-label='Main']) > *", 'visibility')).toBe('hidden');
  });
});

describe('sidebarRailAt', () => {
  it('should rail a narrow viewport and expand a wide one', () => {
    expect(isSidebarCollapsed({ band: 'narrow' })).toBe(true);
    expect(isSidebarCollapsed({ band: 'wide' })).toBe(false);
  });

  it('should let the author’s toggle win within its band', () => {
    expect(isSidebarCollapsed({ band: 'narrow', choice: false })).toBe(false);
    expect(isSidebarCollapsed({ band: 'wide', choice: true })).toBe(true);
  });

  it('should keep the same rail while the viewport stays in its band', () => {
    const rail: SidebarRail = { band: 'narrow', choice: false };
    expect(sidebarRailAt(rail, 'narrow')).toBe(rail);
  });

  it('should drop the author’s toggle once the viewport crosses the threshold, and not revive it on the way back', () => {
    const widened = sidebarRailAt({ band: 'narrow', choice: false }, 'wide');
    expect(widened).toEqual({ band: 'wide' });
    expect(isSidebarCollapsed(widened)).toBe(false);

    const narrowedAgain = sidebarRailAt(widened, 'narrow');
    expect(narrowedAgain).toEqual({ band: 'narrow' });
    expect(isSidebarCollapsed(narrowedAgain)).toBe(true);
  });
});
