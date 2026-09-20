import { createFileRoute } from '@tanstack/react-router';

import { ExportScreen } from '@/features/settings';

export const Route = createFileRoute('/_account/_app/settings/export')({ staticData: { title: 'Data export' }, component: ExportScreen });
