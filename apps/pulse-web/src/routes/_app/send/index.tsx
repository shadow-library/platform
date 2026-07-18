/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import { SendForm } from '@/features/send';

export const Route = createFileRoute('/_app/send/')({
  component: SendForm,
});
