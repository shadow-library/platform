import { type RefObject } from 'react';

import { insertAtCursor, prefixSelectedLines, type ProseEdit, SCENE_BREAK, surroundSelection, TABLE_TEMPLATE, type TextRange } from '@/lib/prose-format';

export type ProseTool = 'bold' | 'italic' | 'bulleted' | 'numbered' | 'table' | 'sceneBreak';

export interface ProseFormatting {
  apply: (tool: ProseTool) => void;
  /** ⌘B and ⌘I, as the toolbar's own titles promise. */
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const EDITS: Record<ProseTool, (text: string, range: TextRange) => ProseEdit> = {
  bold: (text, range) => surroundSelection(text, range, '**', '**'),
  italic: (text, range) => surroundSelection(text, range, '*', '*'),
  bulleted: (text, range) => prefixSelectedLines(text, range, () => '- '),
  numbered: (text, range) => prefixSelectedLines(text, range, index => `${index + 1}. `),
  table: (text, range) => insertAtCursor(text, range.start, TABLE_TEMPLATE),
  sceneBreak: (text, range) => insertAtCursor(text, range.start, SCENE_BREAK),
};

export function useProseFormatting(editorRef: RefObject<HTMLTextAreaElement | null>, body: string, setBody: (body: string) => void): ProseFormatting {
  const apply = (tool: ProseTool): void => {
    const el = editorRef.current;
    if (!el) return;
    const edit = EDITS[tool](body, { start: el.selectionStart, end: el.selectionEnd });
    setBody(edit.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(edit.selection.start, edit.selection.end);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') apply('bold');
    else if (key === 'i') apply('italic');
    else return;
    event.preventDefault();
  };

  return { apply, onKeyDown };
}
