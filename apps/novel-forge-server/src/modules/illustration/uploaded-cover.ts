import { and, eq, or, type SQL, sql } from 'drizzle-orm';

import { type Illustration, type PrimaryDatabase, type Project, schema } from '@server/database';

import { hashInstructions } from './prompt-spec';

export const UPLOADED_COVER_PROMPT_KEY = 'uploaded-cover';

/**
 * No composer ran for a cover the author supplied, so refinement leans on the image itself: every render
 * carries the current selection as its image-to-image reference, and this spec only tells the model to rework it.
 * The `0032` backfill migration writes this exact spec in SQL — change both together.
 */
export function uploadedCoverPromptSpec(): Illustration.PromptSpec {
  return {
    basePrompt: "Book cover artwork for this novel, reworked from the supplied reference image — the author's own cover.",
    subjectFraming: 'Keep the reference composition, subject and title space unless an instruction below changes them.',
    styleNotes: "Match the reference image's medium, palette and lighting.",
    instructions: [],
    promptKey: UPLOADED_COVER_PROMPT_KEY,
    promptVersion: '1.0.0',
  };
}

export function illustrationReferences(ref: string): SQL | undefined {
  // Unrolled rather than `@> '[{"ref":…}]'::jsonb`: the bun-sql driver binds a JSON-string
  // parameter in a form the containment operator never matches.
  return or(eq(schema.illustrations.selectedRef, ref), sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${schema.illustrations.candidates}) e WHERE e->>'ref' = ${ref})`);
}

/**
 * Opens an active cover illustration on `ref` unless an active cover illustration already has it selected — which is
 * also the state `save()` writes the cover from. Run it inside the transaction that wrote the cover, after that write,
 * so the project row lock serialises concurrent writers.
 */
export async function trackUploadedCover(tx: PrimaryDatabase, projectId: bigint, ref: string, ownerId: bigint | null): Promise<void> {
  // Stricter than the 0032 backfill on purpose: at write time a saved illustration, or a stale candidate ref, must not leave the new cover unprocessable.
  const tracked = await tx.$count(
    schema.illustrations,
    and(
      eq(schema.illustrations.projectId, projectId),
      eq(schema.illustrations.subjectType, 'cover'),
      eq(schema.illustrations.status, 'active'),
      eq(schema.illustrations.selectedRef, ref),
    ),
  );
  if (tracked > 0) return;

  const promptSpec = uploadedCoverPromptSpec();
  await tx.insert(schema.illustrations).values({
    projectId,
    subjectType: 'cover',
    subjectKey: null,
    promptSpec,
    candidates: [{ ref, createdAt: new Date().toISOString(), instructionsHash: hashInstructions(promptSpec.instructions), referenceRefs: [], references: [] }],
    selectedRef: ref,
    ownerId,
  });
}

export function setProjectCover(db: PrimaryDatabase, projectId: bigint, ref: string): Promise<Project.Row | undefined> {
  return db.transaction(async rawTx => {
    const tx = rawTx as unknown as PrimaryDatabase;
    const [project] = await tx.update(schema.projects).set({ coverImagePath: ref, updatedAt: new Date() }).where(eq(schema.projects.id, projectId)).returning();
    if (project) await trackUploadedCover(tx, projectId, ref, project.ownerId);
    return project;
  });
}
