/**
 * Importing npm packages
 */
import { createContext, useContext } from 'react';

/**
 * Importing user defined packages
 */
import { type ButtonSize, type ButtonVariant } from '../Button/Button.types';

/**
 * Defining types
 */
export interface ButtonGroupContextValue {
  /** Variant every member inherits — overrides a child's own `variant`. */
  variant: ButtonVariant;
  /** Size every member inherits — overrides a child's own `size`. */
  size: ButtonSize;
}

/**
 * Declaring the constants
 */

/**
 * Shared by ButtonGroup so member Buttons inherit one variant/size. Lives in its own module (not
 * ButtonGroup.tsx) so Button can read it without pulling in the group's stylesheet.
 */
export const ButtonGroupContext = createContext<ButtonGroupContextValue | null>(null);

/** Returns the enclosing ButtonGroup's shared config, or `null` when a Button stands alone. */
export function useButtonGroupContext(): ButtonGroupContextValue | null {
  return useContext(ButtonGroupContext);
}
