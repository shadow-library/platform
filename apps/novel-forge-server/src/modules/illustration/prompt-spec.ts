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

const ROLE_GUIDANCE: Record<Illustration.ReferenceRole, string> = {
  'edit-source': 'Edit-source: rework this image, keeping whatever the instructions do not change.',
  likeness: "Likeness: match the identified figure's face, hair, build and attire; take nothing else from it.",
  style: 'Style: take palette, medium and rendering only; not its subjects or composition.',
};

/** One ordered line per reference image with its rich label, for the composer; the image prompt carries only neutral descriptors. */
export function renderReferenceManifest(references: Illustration.Reference[]): string {
  return references
    .map((reference, index) => {
      const parts = [`Reference ${index + 1}`, reference.role, reference.label ?? reference.source];
      if (reference.note) parts.push(`note: ${reference.note}`);
      return parts.join(' — ');
    })
    .join('\n');
}

/**
 * Renders the image prompt the provider receives. The appearance anchor leads so a re-roll of the same
 * entity produces the same character, the reference manifest tells the model what each attached image is for,
 * and the author's instructions land last so a later one visibly overrides the composed defaults.
 */
export function renderPromptSpec(spec: Illustration.PromptSpec, references: Illustration.Reference[] = []): string {
  return [
    spec.appearanceAnchor ? `Subject appearance (must match exactly): ${spec.appearanceAnchor}` : '',
    renderReferenceBlock(references),
    spec.basePrompt,
    spec.subjectFraming,
    spec.styleNotes,
    ...spec.instructions,
    spec.negativePrompt ? `Do not include: ${spec.negativePrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// Captions, subject keys and words like "chapter" or "illustration" leak into image models as literal content, so each image is named only by position, role and portrait name.
function renderReferenceBlock(references: Illustration.Reference[]): string {
  if (references.length === 0) return '';
  const roles = [...new Set(references.map(reference => reference.role))];
  return [
    'Reference images (in the order attached):',
    ...references.map((reference, index) => {
      const parts = [`Reference image ${index + 1}`, reference.role];
      if (reference.source === 'portrait' && reference.name) parts.push(reference.name);
      if (reference.note) parts.push(`note: ${reference.note}`);
      return parts.join(' — ');
    }),
    ...roles.map(role => ROLE_GUIDANCE[role]),
    roles.some(role => role !== 'edit-source') ? 'Never copy backgrounds, text, watermarks or logos from a likeness or style reference.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}
