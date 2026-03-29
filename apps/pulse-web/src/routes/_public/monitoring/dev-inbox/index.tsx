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

function DevInbox() {
  return <div>Hello "/_public/monitoring/dev-inbox/"!</div>;
}

export const Route = createFileRoute('/_public/monitoring/dev-inbox/')({
  component: DevInbox,
});
