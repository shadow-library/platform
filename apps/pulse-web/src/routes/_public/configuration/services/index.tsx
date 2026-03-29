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

function Services() {
  return <div>Hello "/_public/configuration/services/"!</div>;
}

export const Route = createFileRoute('/_public/configuration/services/')({
  component: Services,
});
