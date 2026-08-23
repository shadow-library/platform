import { createFileRoute } from '@tanstack/react-router';

import { AiScreen } from '@/features/ai';

export const Route = createFileRoute('/_app/ai')({ component: AiScreen });
