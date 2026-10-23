import { useEffect } from 'react';

import { PaneError, PaneLoader } from '@/components/nf';
import { useDraftQuery } from '@/lib/apis';

import { ChapterWorkspace } from './ChapterWorkspace';

interface ChapterEditorProps {
  novelId: string;
  chapter: number;
  openReviewOnLoad: boolean;
  onBack: () => void;
  onPick: (n: number) => void;
}

export function ChapterEditor({ novelId, chapter, openReviewOnLoad, onBack, onPick }: ChapterEditorProps): React.JSX.Element {
  const draftQuery = useDraftQuery(novelId, chapter);
  const draft = draftQuery.data;
  const draftMissing = draftQuery.error?.status === 404;

  // A chapter that 404s before anything loaded has nothing to recover in place, so the author goes back to the list.
  // Once a draft is on screen it stays mounted through a failed refetch, so unsaved text is never dropped with it.
  useEffect(() => {
    if (draftMissing && !draft) onBack();
  }, [draft, draftMissing, onBack]);

  if (draft) return <ChapterWorkspace key={chapter} novelId={novelId} draft={draft} deleted={draftMissing} openReviewOnLoad={openReviewOnLoad} onBack={onBack} onPick={onPick} />;
  if (draftQuery.error && !draftMissing) return <PaneError error={draftQuery.error} />;
  return <PaneLoader />;
}
