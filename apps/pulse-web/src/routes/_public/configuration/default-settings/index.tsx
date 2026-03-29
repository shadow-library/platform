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

function DefaultSettings() {
  return <div>Hello "/_public/configuration/default-settings/"!</div>;
}

export const Route = createFileRoute('/_public/configuration/default-settings/')({
  component: DefaultSettings,
});
