import { createFileRoute } from '@tanstack/react-router';

import { OnboardingScreen } from '@/features/onboarding';

export const Route = createFileRoute('/_account/_setup/onboarding')({ component: OnboardingScreen });
