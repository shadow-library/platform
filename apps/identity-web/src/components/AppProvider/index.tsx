import { ThemeProvider, Toaster, TooltipProvider } from '@shadow-library/ui';
import { themeCookieDomain } from '@shadow-library/web';

export interface AppProviderProps {
  children?: React.ReactNode;
}

/** The QueryClient provider is installed by the TanStack Start and Query SSR integration; `Toaster` gates itself on hydration, so it needs no `ClientOnly`. */
export default function AppProvider(props: AppProviderProps): React.JSX.Element {
  return (
    <ThemeProvider cookieDomain={themeCookieDomain()} legacyStorageKey="shadow-identity-theme">
      <TooltipProvider>{props.children}</TooltipProvider>
      <Toaster placement="top-end" />
    </ThemeProvider>
  );
}
