import { useEffect } from 'react';
import { Button, ChevronRightIcon, Dialog } from '@shadow-library/ui';

import { ChevronLeftIcon } from '@/components/icons';

import styles from './CandidateLightbox.module.css';

interface LightboxCandidate {
  ref: string;
  imageUrl: string;
}

interface CandidateLightboxProps<T extends LightboxCandidate> {
  candidates: readonly T[];
  index: number | undefined;
  selectedRef?: string | null;
  canSelect: boolean;
  onIndexChange: (index: number) => void;
  onSelect: (candidate: T) => void;
  onClose: () => void;
}

export function CandidateLightbox<T extends LightboxCandidate>({
  candidates,
  index,
  selectedRef,
  canSelect,
  onIndexChange,
  onSelect,
  onClose,
}: CandidateLightboxProps<T>): React.JSX.Element {
  const candidate = index === undefined ? undefined : candidates[index];
  const hasPrevious = index !== undefined && index > 0;
  const hasNext = index !== undefined && index < candidates.length - 1;
  const selected = candidate?.ref === selectedRef;

  useEffect(() => {
    if (index === undefined) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (event.key === 'ArrowRight' && index < candidates.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, candidates.length, onIndexChange]);

  return (
    <Dialog open={Boolean(candidate)} onOpenChange={next => !next && onClose()}>
      <Dialog.Content size="xl">
        <Dialog.Header
          title={`Candidate ${(index ?? 0) + 1} of ${candidates.length}`}
          description={selected ? 'This is the image you picked.' : 'Compare the detail before you pick one.'}
        />
        <Dialog.Body>{candidate && <img src={candidate.imageUrl} alt={`Candidate ${(index ?? 0) + 1}, full size`} className={styles.image} />}</Dialog.Body>
        <Dialog.Footer>
          {candidates.length > 1 && (
            <div className={styles.nav}>
              <Button variant="ghost" prefix={<ChevronLeftIcon size={14} />} disabled={!hasPrevious} onClick={() => index !== undefined && onIndexChange(index - 1)}>
                Previous
              </Button>
              <Button variant="ghost" suffix={<ChevronRightIcon size={14} />} disabled={!hasNext} onClick={() => index !== undefined && onIndexChange(index + 1)}>
                Next
              </Button>
            </div>
          )}
          <Dialog.Close asChild>
            <Button variant="ghost">Close</Button>
          </Dialog.Close>
          {canSelect && candidate && (
            <Button
              variant="primary"
              disabled={selected}
              onClick={() => {
                onSelect(candidate);
                onClose();
              }}
            >
              {selected ? 'Selected' : 'Pick this image'}
            </Button>
          )}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
