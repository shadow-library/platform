import { toast } from '@shadow-library/ui';

import { type ChapterEditorController } from './use-chapter-editor';

export interface EditorRecovery {
  copyMine: () => void;
  takeTheirs: () => void;
  discardMine: () => void;
}

/** What the editor strip's buttons do with the author's text when it can't be saved as it stands; each replacement can be undone from its toast. */
export function editorRecovery(editor: ChapterEditorController, setEditing: (editing: boolean) => void): EditorRecovery {
  const { title, body } = editor.state;
  return {
    copyMine: () => {
      navigator.clipboard.writeText(title.trim() ? `${title.trim()}\n\n${body}` : body).then(
        () => toast.success('Your text is copied'),
        () => toast.danger('Copying failed — select the text and copy it yourself'),
      );
    },
    takeTheirs: () => {
      const replaced = editor.takeTheirs();
      toast.neutral('Your edits were replaced with the newer version', { action: { label: 'Undo', onClick: () => editor.restore(replaced) } });
    },
    discardMine: () => {
      const replaced = editor.takeTheirs();
      setEditing(false);
      toast.neutral('Your edits were discarded', {
        action: {
          label: 'Undo',
          onClick: () => {
            editor.restore(replaced);
            setEditing(true);
          },
        },
      });
    },
  };
}
