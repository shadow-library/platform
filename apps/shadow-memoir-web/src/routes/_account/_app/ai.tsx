import { createFileRoute } from '@tanstack/react-router';

import { AiScreen } from '@/features/ai';

export const Route = createFileRoute('/_account/_app/ai')({ component: AiScreen });
