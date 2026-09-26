import { type ReactElement, useState } from 'react';
import { Button, Input, Select, toast } from '@shadow-library/ui';

import { ImageGallery } from '@/components/nf/ImageGallery';
import { ImageUpload } from '@/components/nf/ImageUpload';
import storyBibleStyles from '@/features/story-bible/StoryBible.module.css';
import {
  type EntityResponse,
  useAddEntityImageMutation,
  useChapterRowsQuery,
  useDateEntityImageMutation,
  useDatePortraitMutation,
  useDeleteEntityImageByIdMutation,
  useDeleteEntityImageMutation,
  useEntityQuery,
  useUploadEntityImageMutation,
} from '@/lib/apis';
import { depictsChapterOptions, depictsChapterVisibilityNote, FRONTIER_ROWS, futureChapterError, parseFutureChapter } from '@/lib/illustration-board';
import { referenceErrorMessage } from '@/lib/illustration-references';

import styles from './EntityImages.module.css';

export interface EntityImagesProps {
  novelId: string;
  entity: EntityResponse;
}

const FUTURE = 'future';

interface DepictsChapterFieldProps {
  label: string;
  chapter: number | null;
  frontier: number;
  disabled: boolean;
  onChange: (chapter: number) => void;
}

/** Uploads and re-dates allow a future chapter (ILL_016 only bounds generation), so the picker always offers a bounded custom entry past the frontier for that. */
function DepictsChapterField({ label, chapter, frontier, disabled, onChange }: DepictsChapterFieldProps): ReactElement {
  const value = chapter ?? frontier;
  const isFuture = value > frontier;
  const [choosingFuture, setChoosingFuture] = useState(isFuture);
  const [futureDraft, setFutureDraft] = useState(String(Math.max(value, frontier + 1)));

  const [seeded, setSeeded] = useState(chapter);
  if (seeded !== chapter) {
    setSeeded(chapter);
    setChoosingFuture(value > frontier);
    setFutureDraft(String(Math.max(value, frontier + 1)));
  }

  const note = depictsChapterVisibilityNote(chapter, frontier);
  const selectValue = choosingFuture ? FUTURE : String(value);
  const futureNumber = parseFutureChapter(futureDraft, frontier);
  const futureError = choosingFuture ? futureChapterError(futureDraft, frontier) : undefined;

  const commitFuture = (): void => {
    if (futureNumber !== undefined) onChange(futureNumber);
  };

  return (
    <div className={styles.dateField}>
      <span className={styles.dateLabel}>{label}</span>
      <Select
        size="sm"
        className={styles.dateSelect}
        aria-label={`${label}. ${note}`}
        value={selectValue}
        disabled={disabled}
        onValueChange={v => {
          if (v === FUTURE) {
            setChoosingFuture(true);
            return;
          }
          setChoosingFuture(false);
          onChange(Number(v));
        }}
      >
        <Select.Item value={FUTURE}>Future chapter…</Select.Item>
        {depictsChapterOptions(frontier).map(option => (
          <Select.Item key={option.value} value={String(option.value)}>
            {option.label}
          </Select.Item>
        ))}
      </Select>
      {choosingFuture && (
        <span className={styles.futureRow}>
          <Input
            type="number"
            size="sm"
            className={styles.futureInput}
            min={frontier + 1}
            value={futureDraft}
            disabled={disabled}
            aria-label={`${label} — future chapter number, at least chapter ${frontier + 1}`}
            onValueChange={setFutureDraft}
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              commitFuture();
            }}
          />
          <Button size="sm" variant="secondary" disabled={disabled || futureNumber === undefined} onClick={commitFuture}>
            Set
          </Button>
        </span>
      )}
      <span className={futureError ? styles.dateNoteError : styles.dateNote}>{futureError ?? note}</span>
    </div>
  );
}

export function EntityImages({ novelId, entity }: EntityImagesProps): ReactElement {
  const entityKey = entity.entityKey;
  const full = useEntityQuery(novelId, entityKey).data;
  const frontierQuery = useChapterRowsQuery(novelId, FRONTIER_ROWS);
  const frontier = frontierQuery.data?.frontier ?? 0;
  const uploadImage = useUploadEntityImageMutation(novelId, entityKey);
  const removeImage = useDeleteEntityImageMutation(novelId, entityKey);
  const datePortrait = useDatePortraitMutation(novelId, entityKey);
  const addGalleryImage = useAddEntityImageMutation(novelId, entityKey);
  const removeGalleryImage = useDeleteEntityImageByIdMutation(novelId, entityKey);
  const dateGalleryImage = useDateEntityImageMutation(novelId, entityKey);
  const hasPortrait = Boolean(entity.imageUrl);
  const images = full?.images ?? [];

  return (
    <section className={styles.imagesSection} aria-label="Portrait and gallery">
      <h3 className={storyBibleStyles.label}>Portrait &amp; gallery</h3>
      <ImageGallery
        leading={
          <ImageUpload
            variant="tile"
            src={entity.imageUrl ?? undefined}
            alt={entity.name}
            label="Portrait"
            emptyLabel="Add portrait"
            uploading={uploadImage.isPending || removeImage.isPending}
            onUpload={image =>
              uploadImage.mutate(image, { onSuccess: () => toast.success(`Updated ${entity.name}’s image`), onError: e => toast.danger(referenceErrorMessage(e)) })
            }
            onRemove={() => removeImage.mutate(undefined, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
          />
        }
        images={images.map(img => ({ id: img.id, url: img.imageUrl, caption: img.caption }))}
        busy={addGalleryImage.isPending || removeGalleryImage.isPending || !full}
        showAdd={hasPortrait}
        addLabel="Add more"
        addAriaLabel="Add another image"
        onAdd={image => addGalleryImage.mutate(image, { onSuccess: () => toast.success('Image added'), onError: e => toast.danger(referenceErrorMessage(e)) })}
        onRemove={id => removeGalleryImage.mutate(id, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
      />

      {hasPortrait && (
        <DepictsChapterField
          label="Portrait as of"
          chapter={entity.imageDepictsChapter ?? null}
          frontier={frontier}
          disabled={datePortrait.isPending}
          onChange={chapter =>
            datePortrait.mutate({ depictsChapter: chapter }, { onSuccess: () => toast.success('Portrait re-dated'), onError: e => toast.danger(referenceErrorMessage(e)) })
          }
        />
      )}
      {images.map(image => (
        <DepictsChapterField
          key={image.id}
          label={image.caption ? `“${image.caption}” as of` : 'Image as of'}
          chapter={image.depictsChapter ?? null}
          frontier={frontier}
          disabled={dateGalleryImage.isPending}
          onChange={chapter =>
            dateGalleryImage.mutate(
              { imageId: image.id, depictsChapter: chapter },
              { onSuccess: () => toast.success('Image re-dated'), onError: e => toast.danger(referenceErrorMessage(e)) },
            )
          }
        />
      ))}
    </section>
  );
}
