import { type ReactNode, useRef } from 'react';
import { Spinner } from '@shadow-library/ui';

import { ImageIcon, TrashIcon } from '@/components/icons';
import { ACCEPT_ATTR, readImageFile, type UploadMime } from './image-file';
import styles from './ImageGallery.module.css';

interface GalleryImage {
  id: string;
  url?: string;
  caption?: string | null;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  busy?: boolean;
  addLabel?: string;
  /** Accessible name for the add tile, when it must differ from the visible `addLabel` text. */
  addAriaLabel?: string;
  /** Hides the add tile — for a caller that offers a different add affordance of its own. Defaults to true. */
  showAdd?: boolean;
  /** Extra tile rendered before the images, sharing this grid's row and sizing. */
  leading?: ReactNode;
  onAdd: (body: { mime: UploadMime; image: string }) => void;
  onRemove: (id: string) => void;
}

export function ImageGallery({ images, busy, addLabel = 'Add image', addAriaLabel, showAdd = true, leading, onAdd, onRemove }: ImageGalleryProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.grid} aria-busy={busy || undefined}>
      {leading}
      {images.map(image => (
        <figure key={image.id} className={styles.tile}>
          {image.url ? <img src={image.url} alt={image.caption ?? ''} className={styles.img} /> : <div className={styles.imgFallback} />}
          <button type="button" className={styles.remove} onClick={() => onRemove(image.id)} disabled={busy} aria-label="Remove image">
            <TrashIcon size={13} />
          </button>
          {image.caption && <figcaption className={styles.caption}>{image.caption}</figcaption>}
        </figure>
      ))}

      {showAdd && (
        <button type="button" className={styles.addTile} onClick={() => inputRef.current?.click()} disabled={busy} aria-label={addAriaLabel}>
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <>
              <ImageIcon size={18} />
              <span className={styles.addLabel}>{addLabel}</span>
            </>
          )}
        </button>
      )}

      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className={styles.input} onChange={e => readImageFile(e.target.files?.[0], onAdd)} />
    </div>
  );
}
