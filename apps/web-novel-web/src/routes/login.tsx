/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { LoginScreen } from '@/features/auth';

/**
 * Defining types
 */
interface LoginSearch {
  returnTo?: string;
}

/**
 * Declaring the constants
 */
function validateSearch(search: Record<string, unknown>): LoginSearch {
  // Only same-origin paths may round-trip through the OIDC flow — anything else is an open redirect.
  const value = typeof search.returnTo === 'string' ? search.returnTo : undefined;
  return { returnTo: value && value.startsWith('/') && !value.startsWith('//') ? value : undefined };
}

export const Route = createFileRoute('/login')({
  validateSearch,
  component: LoginScreen,
});
