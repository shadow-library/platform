-- Opens an editable cover illustration for every project cover set before setProjectCover tracked uploads.
-- Mirrors trackUploadedCover and uploadedCoverPromptSpec (src/modules/illustration/uploaded-cover.ts) row for row;
-- the NOT EXISTS guard makes a re-run insert nothing.
INSERT INTO "illustrations" ("project_id", "subject_type", "subject_key", "status", "prompt_spec", "candidates", "selected_ref", "owner_id")
SELECT
  p."id",
  'cover',
  NULL,
  'active',
  jsonb_build_object(
    'basePrompt', 'Book cover artwork for this novel, reworked from the supplied reference image — the author''s own cover.',
    'subjectFraming', 'Keep the reference composition, subject and title space unless an instruction below changes them.',
    'styleNotes', 'Match the reference image''s medium, palette and lighting.',
    'instructions', '[]'::jsonb,
    'promptKey', 'uploaded-cover',
    'promptVersion', '1.0.0'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'ref', p."cover_image_path",
      'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'instructionsHash', encode(sha256(convert_to('[]', 'UTF8')), 'hex')
    )
  ),
  p."cover_image_path",
  p."owner_id"
FROM "projects" p
WHERE p."cover_image_path" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "illustrations" i
    WHERE i."project_id" = p."id"
      AND i."subject_type" = 'cover'
      -- Looser than trackUploadedCover on purpose: a saved generated cover is already visible in the tab and must not be duplicated.
      AND i."status" <> 'discarded'
      AND i."selected_ref" = p."cover_image_path"
  );
