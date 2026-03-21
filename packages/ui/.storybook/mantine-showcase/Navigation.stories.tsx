/**
 * Importing npm packages
 */
import { Anchor, Breadcrumbs, NavLink, Pagination, Stack, Stepper, Tabs } from '@mantine/core';
import { Home, Settings, User } from 'lucide-react';

/**
 * Importing user defined packages
 */
import { preview } from '../preview';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const meta = preview.meta({
  title: 'Mantine Showcase/Navigation',
  parameters: { layout: 'padded' },
});

export const BreadcrumbsNav = meta.story({
  render: () => (
    <Breadcrumbs>
      {['Home', 'Settings', 'Profile'].map((item) => (
        <Anchor key={item} href='#' size='sm'>
          {item}
        </Anchor>
      ))}
    </Breadcrumbs>
  ),
});

export const TabsNav = meta.story({
  render: () => (
    <Tabs defaultValue='components'>
      <Tabs.List>
        <Tabs.Tab value='components' leftSection={<Home size={14} />}>
          Components
        </Tabs.Tab>
        <Tabs.Tab value='theme' leftSection={<Settings size={14} />}>
          Theme
        </Tabs.Tab>
        <Tabs.Tab value='profile' leftSection={<User size={14} />}>
          Profile
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value='components' pt='xs'>
        Components panel content
      </Tabs.Panel>
      <Tabs.Panel value='theme' pt='xs'>
        Theme panel content
      </Tabs.Panel>
      <Tabs.Panel value='profile' pt='xs'>
        Profile panel content
      </Tabs.Panel>
    </Tabs>
  ),
});

export const NavLinks = meta.story({
  render: () => (
    <Stack gap={0} maw={220}>
      {[
        { label: 'Home', icon: <Home size={16} /> },
        { label: 'Settings', icon: <Settings size={16} /> },
        { label: 'Profile', icon: <User size={16} /> },
      ].map((item, i) => (
        <NavLink key={item.label} label={item.label} leftSection={item.icon} active={i === 0} />
      ))}
    </Stack>
  ),
});

export const PaginationNav = meta.story({
  render: () => <Pagination total={10} />,
});

export const Steppers = meta.story({
  render: () => (
    <Stepper active={1} maw={600}>
      <Stepper.Step label='Account' description='Create account' />
      <Stepper.Step label='Profile' description='Set up profile' />
      <Stepper.Step label='Done' description='Review and submit' />
    </Stepper>
  ),
});
