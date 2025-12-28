/**
 * Importing npm packages
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConfigProvider } from 'antd';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

/**
 * Importing npm design components
 */

/**
 * Importing user defined components
 */
import { lightTheme } from './constants';

/**
 *  Importing user defined modules
 */
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
const queryClient = new QueryClient();
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
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={lightTheme}>
          <RouterProvider router={router} />
        </ConfigProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
