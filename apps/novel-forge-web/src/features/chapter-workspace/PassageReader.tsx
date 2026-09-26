import { Fragment, useEffect, useRef, useState } from 'react';
import { Button } from '@shadow-library/ui';

import { Markdown } from '@/components/nf';
import { type PassageSelection, type ProseAnchor, type ProseSegment, renderedSelection, selectionProblem, splitAtAnchors } from '@/lib/passage-suggestions';

import styles from './PassageAsk.module.css';

type Pending = { top: number; left: number } & ({ kind: 'ask'; selection: PassageSelection } | { kind: 'problem'; message: string });

const ACTION_OFFSET = 6;

export interface PassageReaderProps {
  body: string;
  /** False on a final chapter or while the AI writes it: the prose reads as usual and selecting offers nothing. */
  askable: boolean;
  anchors: readonly ProseAnchor[];
  renderCard: (key: string) => React.ReactNode;
  onAsk: (selection: PassageSelection) => void;
}

function pieceOf(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return element?.closest<HTMLElement>('[data-prose]') ?? null;
}

/** The `textContent` offset of a range boundary inside `piece`, counted the way `alignRendered` reads the DOM. */
function textOffset(piece: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(piece, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function PassageReader({ body, askable, anchors, renderCard, onAsk }: PassageReaderProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Pending | undefined>();
  const { before, segments } = splitAtAnchors(body, anchors);
  const segmentsRef = useRef<ProseSegment[]>(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  });

  // Listened for on the document: a drag that starts in the prose often ends outside it.
  useEffect(() => {
    const readSelection = (): void => {
      const container = containerRef.current;
      const selection = window.getSelection();
      if (!askable || !container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPending(undefined);
        return;
      }
      const range = selection.getRangeAt(0);
      const piece = pieceOf(range.startContainer);
      if (!piece || !container.contains(piece)) {
        setPending(undefined);
        return;
      }
      const rect = range.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      const place = { top: rect.bottom - box.top + ACTION_OFFSET, left: Math.max(0, rect.left - box.left) };
      const segment = segmentsRef.current[Number(piece.dataset.prose)];
      if (pieceOf(range.endContainer) !== piece || !segment) {
        setPending({ ...place, kind: 'problem', message: 'Select within one stretch of text — not across a suggestion.' });
        return;
      }
      const result = renderedSelection(
        body,
        segment,
        piece.textContent ?? '',
        textOffset(piece, range.startContainer, range.startOffset),
        textOffset(piece, range.endContainer, range.endOffset),
      );
      if (result.kind === 'ok') {
        setPending({ ...place, kind: 'ask', selection: result.selection });
        return;
      }
      const message = selectionProblem(result);
      setPending(message ? { ...place, kind: 'problem', message } : undefined);
    };
    document.addEventListener('mouseup', readSelection);
    document.addEventListener('keyup', readSelection);
    return () => {
      document.removeEventListener('mouseup', readSelection);
      document.removeEventListener('keyup', readSelection);
    };
  }, [askable, body]);

  const ask = (selection: PassageSelection): void => {
    setPending(undefined);
    window.getSelection()?.removeAllRanges();
    onAsk(selection);
  };

  const announcement = pending?.kind === 'ask' ? 'Ask for changes is ready for the selected passage.' : pending?.kind === 'problem' ? pending.message : '';

  return (
    <div ref={containerRef} className={styles.selection}>
      <div role="status" className="sr-only">
        {announcement}
      </div>
      {before.map(key => (
        <Fragment key={key}>{renderCard(key)}</Fragment>
      ))}
      {segments.map((segment, index) => (
        <Fragment key={index}>
          <div data-prose={index} className={styles.segment}>
            <Markdown content={segment.source} />
          </div>
          {segment.after.map(key => (
            <Fragment key={key}>{renderCard(key)}</Fragment>
          ))}
        </Fragment>
      ))}
      {pending?.kind === 'ask' && (
        <div className={styles.selectionAction} style={{ top: pending.top, left: pending.left }}>
          <Button variant="primary" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => ask(pending.selection)}>
            Ask for changes
          </Button>
        </div>
      )}
      {pending?.kind === 'problem' && (
        <div className={styles.selectionNote} style={{ top: pending.top, left: pending.left }}>
          {pending.message}
        </div>
      )}
    </div>
  );
}
