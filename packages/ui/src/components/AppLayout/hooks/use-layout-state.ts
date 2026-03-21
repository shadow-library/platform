/**
 * Importing npm packages
 */
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

interface UseLayoutStateOptions {
  defaultCollapsed?: boolean;
}

/**
 * Declaring the constants
 */

export function useLayoutState(options: UseLayoutStateOptions = {}) {
  const { defaultCollapsed = false } = options;

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);

  const toggleCollapsed = () => setCollapsed(prev => !prev);

  return { collapsed, toggleCollapsed, mobileOpened, toggleMobile, closeMobile };
}
