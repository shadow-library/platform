import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { QuestEditScreen } from '@/features/quests';

export const Route = createFileRoute('/_account/_app/quests/$questId_/edit')({ component: QuestEdit });

function QuestEdit(): ReactElement {
  const { questId } = Route.useParams();
  return <QuestEditScreen questId={questId} />;
}
