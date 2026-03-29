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

function RolesAndPermissions() {
  return <div>Hello "/_public/access-control/roles-permissions/"!</div>;
}

export const Route = createFileRoute('/_public/access-control/roles-permissions/')({
  component: RolesAndPermissions,
});
