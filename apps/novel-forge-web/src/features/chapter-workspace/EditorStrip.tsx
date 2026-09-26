import { Button } from '@shadow-library/ui';

import { type EditorState } from '@/lib/chapter-editor';

import { WorkspaceStrip } from './WorkspaceStrip';

export interface EditorStripProps {
  state: EditorState;
  chapter: number;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onCopyMine: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}

export function EditorStrip({ state, chapter, onKeepMine, onTakeTheirs, onCopyMine, onDiscard, onRetry }: EditorStripProps): React.JSX.Element | null {
  const { status, base, theirs, error } = state;
  const copy = (
    <Button variant="secondary" size="sm" onClick={onCopyMine}>
      Copy mine
    </Button>
  );

  if (status === 'deleted') {
    return (
      <WorkspaceStrip tone="danger" urgent actions={copy}>
        This chapter was deleted while you were editing, so these edits can’t be saved here. Copy them before you leave.
      </WorkspaceStrip>
    );
  }
  if (status === 'locked') {
    return (
      <WorkspaceStrip
        tone="danger"
        urgent
        actions={
          <>
            {copy}
            <Button variant="ghost" size="sm" onClick={onDiscard}>
              Discard my edits
            </Button>
          </>
        }
      >
        Chapter {chapter} was finalized while you were editing, so these edits can’t be saved here. Copy them, then use Amend to change the final text.
      </WorkspaceStrip>
    );
  }
  if (status === 'held') {
    return (
      <WorkspaceStrip
        tone="danger"
        urgent
        actions={
          <>
            {copy}
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </>
        }
      >
        {error}
      </WorkspaceStrip>
    );
  }
  if (status === 'conflict' && theirs) {
    return (
      <WorkspaceStrip
        tone="warning"
        urgent
        actions={
          <>
            <Button variant="primary" size="sm" onClick={onKeepMine}>
              Keep mine
            </Button>
            <Button variant="secondary" size="sm" onClick={onTakeTheirs}>
              Take theirs
            </Button>
            <Button variant="ghost" size="sm" onClick={onCopyMine}>
              Copy mine
            </Button>
          </>
        }
      >
        {theirs.revision === base.revision
          ? `This chapter changed in another window since you started editing version ${base.revision}. Saving is paused until you choose.`
          : `This chapter changed while you were editing — you started from version ${base.revision}, and version ${theirs.revision} is newer. Saving is paused until you choose.`}
      </WorkspaceStrip>
    );
  }
  if (status === 'failed') {
    return (
      <WorkspaceStrip
        tone="danger"
        urgent
        detail={error}
        actions={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        Your latest edits aren’t saved.
      </WorkspaceStrip>
    );
  }
  return null;
}
