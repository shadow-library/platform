/**
 * Importing npm packages
 */
import { ActionIcon, Avatar, Box, Burger, Group, Indicator, Menu, Text, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { Bell, Moon, Sun } from 'lucide-react';
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { getInitials } from '@/lib';
import { type VoidFn } from '@/types';

import { useActiveNavLabel } from './hooks/use-active-nav-label';
import { type NavGroup, type NavItem, type NotificationsConfig, type UserInfo } from './layout.types';

/**
 * Defining types
 */

interface TopNavbarProps {
  navItems: (NavItem | NavGroup)[];
  headerContent?: ReactNode;
  user?: UserInfo;
  notifications?: NotificationsConfig;
  showThemeToggle?: boolean;
  mobileOpened: boolean;
  onToggleMobile: VoidFn;
}

/**
 * Declaring the constants
 */

export function TopNavbar({ navItems, headerContent, user, notifications, showThemeToggle = true, mobileOpened, onToggleMobile }: TopNavbarProps) {
  const theme = useComputedColorScheme();
  const { toggleColorScheme } = useMantineColorScheme();
  const activeLabel = useActiveNavLabel(navItems);

  return (
    <Group h='100%' px='md' justify='space-between' wrap='nowrap'>
      {/* Left section */}
      <Group gap='sm' wrap='nowrap'>
        <Burger opened={mobileOpened} onClick={onToggleMobile} hiddenFrom='sm' size='sm' aria-label='Toggle navigation' />
        <Box visibleFrom='sm'>
          {headerContent ??
            (activeLabel && (
              <Text fw={500} size='sm' c='dimmed'>
                {activeLabel}
              </Text>
            ))}
        </Box>
      </Group>

      {/* Right section */}
      <Group gap='sm' wrap='nowrap'>
        {showThemeToggle && (
          <ActionIcon onClick={toggleColorScheme} size='lg' aria-label='Toggle color scheme'>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </ActionIcon>
        )}

        {notifications && (
          <Indicator label={notifications.count} size={16} disabled={notifications.count === 0} offset={4}>
            <ActionIcon onClick={notifications.onClick} size='lg' aria-label='Notifications'>
              <Bell size={18} />
            </ActionIcon>
          </Indicator>
        )}

        {user && (
          <Menu position='bottom-end' offset={8} width={200}>
            <Menu.Target>
              <ActionIcon variant='transparent' size='lg' radius='xl' aria-label='User menu' ml='md'>
                <Avatar src={user.avatarUrl} size='sm' radius='xl' color='initials'>
                  {!user.avatarUrl && getInitials(user.name)}
                </Avatar>
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                <Text size='sm' fw={500}>
                  {user.name}
                </Text>
                {user.email && (
                  <Text size='xs' c='dimmed'>
                    {user.email}
                  </Text>
                )}
              </Menu.Label>
              {user.actions?.map((action, index) => (
                <div key={action.label}>
                  {(action.divider || index === 0) && <Menu.Divider />}
                  <Menu.Item leftSection={action.icon && <action.icon size={14} />} color={action.color} onClick={action.onClick}>
                    {action.label}
                  </Menu.Item>
                </div>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  );
}
