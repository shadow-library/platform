import { createFileRoute } from '@tanstack/react-router';

import { DeleteAccountScreen } from '@/features/settings';

export const Route = createFileRoute('/_account/_app/settings/delete')({ staticData: { title: 'Delete your data' }, component: DeleteAccountScreen });
