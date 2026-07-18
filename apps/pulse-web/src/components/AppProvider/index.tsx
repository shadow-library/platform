/**
 * Importing npm packages
 */
import { type ReactElement } from 'react';
import { ThemeProvider } from '@shadow-library/ui';

/**
 *  Importing user defined modules
 */
import { ConfirmProvider } from '@/features/shared/ConfirmProvider';

/**
 * Declaring types
 */

export interface AppProviderProps {
  children?: React.ReactNode;
}

/**
 * Declaring constants
 *
 * The QueryClientProvider is installed by `createAppRouter` (via the SSR-query integration's router
 * `Wrap`), so this provider owns only theming and the confirm dialog.
 */

export default function AppProvider(props: AppProviderProps): ReactElement {
  return (
    <ThemeProvider storageKey="theme">
      <ConfirmProvider>{props.children}</ConfirmProvider>
    </ThemeProvider>
  );
}
