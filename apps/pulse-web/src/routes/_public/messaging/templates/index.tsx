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

function Templates() {
  return <div>Hello "/_public/messaging/templates/"!</div>;
}

export const Route = createFileRoute('/_public/messaging/templates/')({
  component: Templates,
});
