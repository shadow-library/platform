/**
 * Importing npm packages
 */
import { ThemeProvider } from '@shadow-library/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
 */
export const queryClient = new QueryClient();

export default function AppProvider(props: AppProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider storageKey="theme">
        <ConfirmProvider>{props.children}</ConfirmProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
