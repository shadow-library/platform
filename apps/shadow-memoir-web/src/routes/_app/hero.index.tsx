import { createFileRoute } from '@tanstack/react-router';

import { HeroScreen } from '@/features/hero';

export const Route = createFileRoute('/_app/hero/')({ component: HeroScreen });
