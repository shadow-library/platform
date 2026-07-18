/**
 * Importing npm packages
 */
import { createFileRoute, Outlet } from '@tanstack/react-router';

/**
 *  Importing user defined modules
 */
import Layout from '@/components/Layout';
import { requireSession } from '@/lib/session';

/** The authenticated admin group — every page of this internal tool sits behind the session gate. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});
