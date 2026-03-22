/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */

/**
 * Declaring types
 */

/**
 * Declaring constants
 */

function Home() {
  return (
    <div>
      <h1>Welcome to Shadow Pulse</h1>
    </div>
  );
}

export const Route = createFileRoute('/')({
  component: Home,
});
