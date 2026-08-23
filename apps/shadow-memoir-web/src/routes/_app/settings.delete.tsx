import { createFileRoute } from '@tanstack/react-router';

import { DeleteAccountScreen } from '@/features/settings';

export const Route = createFileRoute('/_app/settings/delete')({ component: DeleteAccountScreen });
