import { createFileRoute } from '@tanstack/react-router';

import { ExportScreen } from '@/features/settings';

export const Route = createFileRoute('/_app/settings/export')({ component: ExportScreen });
