/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

function Providers() {
  return <div>Hello "/_public/messaging/providers/"!</div>;
}

export const Route = createFileRoute('/_public/messaging/providers/')({
  component: Providers,
});
