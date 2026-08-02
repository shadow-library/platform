/**
 * Importing npm packages
 */
import { ThemeProvider, Toaster, TooltipProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

/**
 * Declaring types
 */
export interface AppProvidersProps {
  children?: React.ReactNode;
}

/**
 * Declaring constants
 */

/**
 * App-wide client providers, rendered inside the root document around every route. The QueryClientProvider
 * is intentionally absent — TanStack Start's router/query SSR integration (see `src/router.tsx`) mounts a
 * per-request QueryClient and provider for us, which is also what makes loader-hydrated data work.
 *
 * The Toaster is SSR-safe on its own — it returns null on the server and its store reports a stable empty
 * server snapshot — so it no longer needs a ClientOnly boundary.
 */
export function AppProviders(props: AppProvidersProps): React.JSX.Element {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="theme">
      <TooltipProvider>{props.children}</TooltipProvider>
      <Toaster placement="top-end" />
    </ThemeProvider>
  );
}
