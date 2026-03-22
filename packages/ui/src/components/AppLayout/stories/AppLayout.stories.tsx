/**
 * Importing npm packages
 */
import { expect, waitFor } from 'storybook/test';

import { D, E, M, O } from '@/components/Logo';
import { preview } from '$storybook/preview';

/**
 * Importing user defined packages
 */
import { AppLayout } from '../AppLayout';
import { ContentFooter } from '../ContentFooter';
import { SideNavbar } from '../SideNavbar';
import { SideNavbarItem } from '../SideNavbarItem';
import { TopNavbar } from '../TopNavbar';
import { sampleNavItems, sampleNotifications, sampleUser, withRouter } from './AppLayout.setup';

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
    productName: [D, E, M, O],
    navItems: sampleNavItems,
    user: sampleUser,
    notifications: sampleNotifications,
    footer: { version: 'v1.0.0' },
    children: (
      <div>
        <h2>Page Content</h2>
        <p>This is the main content area of the application.</p>
      </div>
    ),
  },
});

export const Default = meta.story({
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
  play: async ({ canvas, userEvent }) => {
    // In collapsed mode, nav item labels should not be visible as text
    await expect(canvas.queryByText('Dashboard')).not.toBeInTheDocument();

    // Collapse toggle button should be present
    const toggleButton = canvas.getByLabelText('Toggle sidebar');
    await expect(toggleButton).toBeVisible();

    // Expanding the sidebar should reveal nav labels
    await userEvent.click(toggleButton);
    waitFor(() => expect(canvas.getByText('Dashboard')).toBeVisible(), { timeout: 300 });
  },
});

export const NoUser = meta.story({
  args: {
    user: undefined,
  },
  play: async ({ canvas }) => {
    // User avatar initials should not be rendered
    await expect(canvas.queryByText('LP')).not.toBeInTheDocument();
  },
});

export const NoNotifications = meta.story({
  args: {
    notifications: undefined,
  },
  play: async ({ canvas }) => {
    // Notification bell button should not be rendered
    await expect(canvas.queryByLabelText('Notifications')).not.toBeInTheDocument();
  },
});

export const MinimalHeader = meta.story({
  args: {
    user: undefined,
    notifications: undefined,
    showThemeToggle: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByLabelText('Toggle color scheme')).not.toBeInTheDocument();
    await expect(canvas.queryByLabelText('Notifications')).not.toBeInTheDocument();
    await expect(canvas.queryByText('LP')).not.toBeInTheDocument();
  },
});

export const CustomFooter = meta.story({
  args: {
    footer: {
      content: <div style={{ padding: '8px', textAlign: 'center' }}>Custom Footer Content</div>,
    },
  },
  play: async ({ canvas }) => {
    const footerContent = canvas.getByText('Custom Footer Content');
    await expect(footerContent).toBeVisible();
  },
});
