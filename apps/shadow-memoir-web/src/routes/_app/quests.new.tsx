import { createFileRoute } from '@tanstack/react-router';

import { QuestBuilderScreen } from '@/features/quests';

export const Route = createFileRoute('/_app/quests/new')({ component: QuestBuilderScreen });
