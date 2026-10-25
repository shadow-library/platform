export interface EditorRef {
  createdBy?: string | undefined;
  createdByName?: string | null | undefined;
}

export function editorLabel({ createdBy, createdByName }: EditorRef, viewerSub: string | undefined): string | null {
  if (createdBy && createdBy === viewerSub) return 'you';
  return createdByName || null;
}
