/**
 * Importing npm packages
 */
import { createContext } from 'react';

/**
 * Declaring the constants
 */
export interface DrawerContextValue {
  modal: boolean;
  titleId: string;
  onClose: () => void;
}

export const DrawerContext = createContext<DrawerContextValue>({ modal: true, titleId: '', onClose: () => undefined });
