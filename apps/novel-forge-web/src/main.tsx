/**
 * Importing npm packages
 */
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

/**
 * Importing npm design components
 */

/**
 * Importing user defined components
 */

/**
 *  Importing user defined modules
 */
import AppProvider, { queryClient } from './components/AppProvider';
import reportWebVitals from './reportWebVitals';
import { routeTree } from './routeTree.gen';

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
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

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
