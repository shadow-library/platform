/**
 * Importing npm packages
 */
import { expect, waitFor } from 'storybook/test';

import { preview } from '$storybook/preview';

/**
 * Importing user defined packages
 */
import { AppLayout } from '../AppLayout';
import { ContentFooter } from '../ContentFooter';
import { SideNavbar } from '../SideNavbar';
import { SideNavbarItem } from '../SideNavbarItem';
import { TopNavbar } from '../TopNavbar';
import { groupedNavItems, sampleNavItems, sampleNotifications, sampleUser, withRouter } from './AppLayout.setup';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const meta = preview.meta({
  title: 'Shadow-UI/AppLayout',
  component: AppLayout,
  subcomponents: { TopNavbar, SideNavbar, SideNavbarItem, ContentFooter },
  parameters: { layout: 'fullscreen' },
  decorators: [withRouter('/')],
  args: {
    appName: 'Demo',
    navItems: sampleNavItems,
    user: sampleUser,
    notifications: sampleNotifications,
    footer: <div>Footer content</div>,
    children: (
      <div>
        <h2>Page Content</h2>
        <p>This is the main content area of the application.</p>
      </div>
    ),
  },
});

export const Default = meta.story({
  /** Test: clicking a nav item with children expands its submenu */
  play: async ({ canvas, userEvent }) => {
    const userMenu = canvas.getByText('Users', { exact: true });
    await expect(userMenu).toBeVisible();
    await userEvent.click(userMenu);

    waitFor(() => expect(canvas.getByText('All Users')).toBeVisible(), { timeout: 100 });
  },
});

export const CollapsedSidebar = meta.story({
  args: {
    defaultCollapsed: true,
  },
  /** Test: collapsed sidebar hides nav labels and shows the toggle button */
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('Projects')).not.toBeInTheDocument();

    const toggleButton = canvas.getByLabelText('Toggle sidebar');
    await expect(toggleButton).toBeVisible();
  },
});

export const NoUser = meta.story({
  args: {
    user: undefined,
  },
  /** Test: user avatar is not rendered when user prop is omitted */
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('LP')).not.toBeInTheDocument();
  },
});

export const NoNotifications = meta.story({
  args: {
    notifications: undefined,
  },
  /** Test: notification bell is not rendered when notifications prop is omitted */
  play: async ({ canvas }) => {
    await expect(canvas.queryByLabelText('Notifications')).not.toBeInTheDocument();
  },
});

export const MinimalHeader = meta.story({
  args: {
    user: undefined,
    notifications: undefined,
    showThemeToggle: false,
  },
  /** Test: header renders without theme toggle, notifications, or user avatar */
  play: async ({ canvas }) => {
    await expect(canvas.queryByLabelText('Toggle color scheme')).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText('Notifications')).not.toBeInTheDocument();
    await expect(canvas.queryByText('LP')).not.toBeInTheDocument();
  },
});

export const WithPageTitle = meta.story({
  decorators: [withRouter('/users/roles')],
  /** Test: active page title resolves to the deepest matching nav label ("Roles", not "Users") */
  play: async ({ canvas }) => {
    const matches = canvas.getAllByText('Roles');
    await expect(matches.length).toBeGreaterThanOrEqual(2);
  },
});

export const WithHeaderContent = meta.story({
  args: {
    headerContent: <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--mantine-color-dimmed)' }}>Home &rsaquo; Dashboard</span>,
  },
  /** Test: custom header content replaces the auto-derived page title */
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Home › Dashboard')).toBeVisible();
  },
});

export const WithGroupedNav = meta.story({
  args: {
    navItems: groupedNavItems,
  },
  /** Test: grouped nav items render with visible group titles */
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Main')).toBeVisible();
    await expect(canvas.getByText('Management')).toBeVisible();
    await expect(canvas.getByText('System')).toBeVisible();
  },
});

export const WithScrollableContent = meta.story({
  args: {
    children: (
      <div>
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} style={{ marginBottom: '24px', padding: '24px', border: '1px solid var(--mantine-color-gray-3)', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Section {i + 1}</h3>
            <p style={{ margin: 0, color: 'var(--mantine-color-dimmed)' }}>
              This is content block {i + 1}. The layout should scroll the main content area while the sidebar and top navbar remain fixed in place.
            </p>
          </div>
        ))}
      </div>
    ),
  },
});
