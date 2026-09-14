import { createFileRoute } from '@tanstack/react-router';

import { QuestBuilderScreen, validateQuestDuplicateSearch } from '@/features/quests';

export const Route = createFileRoute('/_app/quests/new')({
  validateSearch: validateQuestDuplicateSearch,
  component: QuestBuilderScreen,
});
