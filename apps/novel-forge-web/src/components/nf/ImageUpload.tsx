/**
 * Importing npm packages
 */
import { Spinner, toast } from '@shadow-library/ui';
import { type ReactNode, useRef } from 'react';

/**
 * Importing user defined packages
 */
import { ImageIcon, TrashIcon } from '@/components/icons';
import styles from './ImageUpload.module.css';

/**
 * A small, reusable image picker: shows the current image (or a placeholder) and reveals Upload /
 * Replace / Remove actions over it. The parent sizes and shapes the box via `className`, and receives
 * the chosen file as base64 bytes ready for the upload endpoints.
 */
type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp';
const ACCEPTED: UploadMime[] = ['image/png', 'image/jpeg', 'image/webp'];
// Keep the base64 body under the server's 12MB limit and give oversized files a clear message.
const MAX_BYTES = 8 * 1024 * 1024;

interface ImageUploadProps {
  src?: string;
  alt: string;
  uploading?: boolean;
  className?: string;
  placeholder?: ReactNode;
  onUpload: (body: { mime: UploadMime; image: string }) => void;
  onRemove?: () => void;
}

export function ImageUpload({ src, alt, uploading, className, placeholder, onUpload, onRemove }: ImageUploadProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (): void => inputRef.current?.click();

  const onFile = (file: File | undefined): void => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type as UploadMime)) {
      toast.danger('Use a PNG, JPEG, or WebP image');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.danger('Image is too large — pick one under 8 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // `readAsDataURL` yields `data:<mime>;base64,<bytes>` — the endpoint wants the bytes alone.
      const base64 = (reader.result as string).split(',')[1] ?? '';
      onUpload({ mime: file.type as UploadMime, image: base64 });
    };
    reader.onerror = () => toast.danger('Could not read that image');
    reader.readAsDataURL(file);
  };

  return (
    <div className={`${styles.preview} ${className ?? ''}`} data-empty={src ? undefined : 'true'}>
      {src ? (
        <img src={src} alt={alt} className={styles.img} />
      ) : (
        (placeholder ?? (
          <div className={styles.placeholder}>
            <ImageIcon size={22} />
          </div>
        ))
      )}

      {uploading && (
        <div className={styles.overlay}>
          <Spinner size="md" />
        </div>
      )}

      <div className={styles.bar}>
        <button type="button" className={styles.action} onClick={pick} disabled={uploading}>
          <ImageIcon size={14} />
          {src ? 'Replace' : 'Upload'}
        </button>
        {src && onRemove && (
          <button type="button" className={`${styles.action} ${styles.actionDanger}`} onClick={() => onRemove()} disabled={uploading} aria-label="Remove image">
            <TrashIcon size={14} />
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className={styles.input} onChange={e => onFile(e.target.files?.[0])} />
    </div>
  );
}
