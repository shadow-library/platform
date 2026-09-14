import { createFileRoute } from '@tanstack/react-router';

import { QuestListScreen } from '@/features/quests';

export const Route = createFileRoute('/_account/_app/quests/')({ component: QuestListScreen });
