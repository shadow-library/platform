import { createFileRoute } from '@tanstack/react-router';

import { RecoveryScreen } from '@/features/hero';

export const Route = createFileRoute('/_app/hero/recovery')({ component: RecoveryScreen });
