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
export const queryClient = new QueryClient();

export default function AppProvider(props: AppProviderProps): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>{props.children}</TooltipProvider>
        <Toaster placement="bottom-end" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export * from './ThemeProvider';
