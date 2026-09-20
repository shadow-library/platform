import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { QuestDetailScreen } from '@/features/quests';

export const Route = createFileRoute('/_account/_app/quests/$questId')({ staticData: { title: 'Quest details' }, component: QuestDetail });

function QuestDetail(): ReactElement {
  const { questId } = Route.useParams();
  return <QuestDetailScreen questId={questId} />;
}
