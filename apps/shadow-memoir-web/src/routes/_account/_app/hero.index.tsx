import { createFileRoute } from '@tanstack/react-router';

import { HeroScreen } from '@/features/hero';

export const Route = createFileRoute('/_account/_app/hero/')({ staticData: { title: 'Hero' }, component: HeroScreen });
