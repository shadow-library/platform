import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { QuestEditorScreen } from '@/features/quests';

export const Route = createFileRoute('/_app/quests/$questId')({ component: QuestEditor });

function QuestEditor(): ReactElement {
  const { questId } = Route.useParams();
  return <QuestEditorScreen questId={questId} />;
}
