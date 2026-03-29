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

function Senders() {
  return <div>Hello "/_public/messaging/senders/"!</div>;
}

export const Route = createFileRoute('/_public/messaging/senders/')({
  component: Senders,
});
