/**
 * Importing npm packages
 */
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { createAppRouter } from '@shadow-library/web/router';

/**
 * Importing npm design components
 */

/**
 * Importing user defined components
 */

/**
 *  Importing user defined modules
 */
import { routeTree } from '../generated/routeTree.gen';
import AppProvider from './components/AppProvider';
import RouteError from './components/RouteError';
import reportWebVitals from './reportWebVitals';
import './styles.css';
/**
 * Declaring types
 */

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

/**
 * Declaring constants and variables
 */
/**
 * Without an error component a route that throws renders TanStack's bare default, which says nothing
 * an operator can act on — least of all for a 403, the one failure they meet by simply lacking a role.
 */
const router = createAppRouter(routeTree, { router: { defaultErrorComponent: RouteError } });

const rootElement = document.getElementById('app');
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <AppProvider>
        <RouterProvider router={router} />
      </AppProvider>
    </StrictMode>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
