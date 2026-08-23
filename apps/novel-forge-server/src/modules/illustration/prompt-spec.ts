import { createHash } from 'node:crypto';

import { AppErrorCode } from '@server/classes';
import { type Illustration } from '@server/database';

/** A structured edit to `promptSpec.instructions`; exactly one of the three must be supplied. */
export interface InstructionEdit {
  add?: string;
  removeIndex?: number;
  replace?: { index: number; text: string };
}

export function applyInstructionEdit(instructions: string[], edit: InstructionEdit): string[] {
  const supplied = [edit.add !== undefined, edit.removeIndex !== undefined, edit.replace !== undefined].filter(Boolean).length;
  if (supplied !== 1) throw AppErrorCode.ILL_007.create();

  if (edit.add !== undefined) return [...instructions, edit.add];

  if (edit.removeIndex !== undefined) {
    if (edit.removeIndex < 0 || edit.removeIndex >= instructions.length) throw AppErrorCode.ILL_008.create();
    return instructions.filter((_, index) => index !== edit.removeIndex);
  }

  const { index, text } = edit.replace as { index: number; text: string };
  if (index < 0 || index >= instructions.length) throw AppErrorCode.ILL_008.create();
  return instructions.map((instruction, at) => (at === index ? text : instruction));
}

export function hashInstructions(instructions: string[]): string {
  return createHash('sha256').update(JSON.stringify(instructions)).digest('hex');
}

/**
 * Renders the image prompt the provider receives. The appearance anchor leads so a re-roll of the same
 * entity produces the same character, and the author's instructions land last so a later one visibly
 * overrides the composed defaults.
 */
export function renderPromptSpec(spec: Illustration.PromptSpec): string {
  return [
    spec.appearanceAnchor ? `Subject appearance (must match exactly): ${spec.appearanceAnchor}` : '',
    spec.basePrompt,
    spec.subjectFraming,
    spec.styleNotes,
    ...spec.instructions,
    spec.negativePrompt ? `Do not include: ${spec.negativePrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
