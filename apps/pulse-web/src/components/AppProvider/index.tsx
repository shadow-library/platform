/**
 * Importing npm packages
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 *  Importing user defined modules
 */
import { ConfirmProvider } from '@/features/shared/ConfirmProvider';

import ThemeProvider from './ThemeProvider';

/**
 * Declaring types
 */

export interface AppProviderProps {
  children?: React.ReactNode;
}

/**
 * Declaring constants
 */
export const queryClient = new QueryClient();

export default function AppProvider(props: AppProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfirmProvider>{props.children}</ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export * from './ThemeProvider';
