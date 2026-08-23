import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function QuestBuilderScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="New quest"
      summary="Name, notes, stat affinity, strictness with its rules stated plainly, the recurrence editor, consequences, reminders and an optional health threshold."
    />
  );
}

export interface QuestEditorScreenProps {
  questId: string;
}

export function QuestEditorScreen({ questId }: QuestEditorScreenProps): ReactElement {
  return (
    <ScreenPlaceholder
      title="Edit quest"
      summary="The quest builder bound to an existing quest, with its occurrence exceptions and history."
    >{`Quest ${questId} is not editable yet.`}</ScreenPlaceholder>
  );
}
