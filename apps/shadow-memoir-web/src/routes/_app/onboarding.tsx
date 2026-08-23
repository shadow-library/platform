import { createFileRoute } from '@tanstack/react-router';

import { OnboardingScreen } from '@/features/onboarding';

export const Route = createFileRoute('/_app/onboarding')({ component: OnboardingScreen });
