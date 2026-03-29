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

function Metrics() {
  return <div>Hello "/_public/monitoring/metrics/"!</div>;
}

export const Route = createFileRoute('/_public/monitoring/metrics/')({
  component: Metrics,
});
