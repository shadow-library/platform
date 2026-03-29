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

function Users() {
  return <div>Hello "/_public/access-control/users/"!</div>;
}

export const Route = createFileRoute('/_public/access-control/users/')({
  component: Users,
});
