/**
 * Importing npm packages
 */
import { type ReactElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@shadow-library/ui/styles.css';

/**
 * Importing user defined packages
 */
import { isLoggedIn } from './lib/context';
import { Router } from './lib/router';
import { ErrorPage } from './pages/error-page';
import { routes } from './pages/routes';

import './styles/theme.css';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** `/` is a dispatcher, not a page: signed-in browsers land on the account, others on sign-in. */
function RootRedirect(): ReactElement {
  window.location.replace(isLoggedIn() ? '/account' : '/login');
  return <></>;
}

const table = [{ path: '/', component: RootRedirect }, ...routes];

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root container');

document.documentElement.dataset.theme = 'dark';
createRoot(container).render(
  <StrictMode>
    <Router routes={table} fallback={ErrorPage} />
  </StrictMode>,
);
