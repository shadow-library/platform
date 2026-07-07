/**
 * Importing npm packages
 */
import { createContext } from 'react';

/**
 * Declaring the constants
 */
export const SidebarContext = createContext<{ collapsed: boolean }>({ collapsed: false });
