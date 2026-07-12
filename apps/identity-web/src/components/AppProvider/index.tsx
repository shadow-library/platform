/**
 * Importing npm packages
 */
import { Toaster, TooltipProvider } from '@shadow-library/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 *  Importing user defined modules
 */
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
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Identity data is session-scoped and changes rarely within a view; a short stale window keeps
      // navigation snappy without serving stale security state after a mutation invalidates its keys.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function AppProvider(props: AppProviderProps): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>{props.children}</TooltipProvider>
        <Toaster placement="top-end" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export * from './ThemeProvider';
