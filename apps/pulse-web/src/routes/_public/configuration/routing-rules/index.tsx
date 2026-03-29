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

function RoutingRules() {
  return <div>Hello "/_public/configuration/routing-rules/"!</div>;
}

export const Route = createFileRoute('/_public/configuration/routing-rules/')({
  component: RoutingRules,
});
