/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { GenresScreen } from '@/features/genres';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
export const Route = createFileRoute('/_shell/genres')({
  component: GenresScreen,
});
