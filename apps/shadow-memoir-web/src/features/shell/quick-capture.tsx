import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Kbd, toast } from '@shadow-library/ui';

import { OverlaySurface } from '@/components/OverlaySurface';
import { AiIcon, LogIcon, MoneyIcon, PlanIcon, QuestIcon, TodayIcon } from '@/components/icons';
import { type CaptureDraft, parseCapture, useCommand, useMemoirData, useOccurrenceSearch } from '@/lib/data';

import styles from './quick-capture.module.css';

export interface QuickCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Destination {
  to: string;
  label: string;
  icon: ReactElement;
  keywords: string[];
}

const DESTINATIONS: Destination[] = [
  { to: '/', label: 'Today', icon: <TodayIcon size={16} />, keywords: ['day', 'quests'] },
  { to: '/plan', label: 'Planning Board', icon: <PlanIcon size={16} />, keywords: ['week', 'calendar', 'schedule'] },
  { to: '/quests', label: 'Quests', icon: <QuestIcon size={16} />, keywords: ['library'] },
  { to: '/quests/new', label: 'New quest', icon: <QuestIcon size={16} />, keywords: ['create', 'add'] },
  { to: '/log', label: 'Quick log', icon: <LogIcon size={16} />, keywords: ['journal', 'meal', 'weight', 'steps', 'water', 'sleep'] },
  { to: '/finance', label: 'Money', icon: <MoneyIcon size={16} />, keywords: ['expense', 'spend', 'receipt', 'subscription'] },
  { to: '/ai', label: 'Ask', icon: <AiIcon size={16} />, keywords: ['coach', 'insight'] },
];

/**
 * Parsing is local-first heuristics and nothing else (PRODUCT.md §6.2) — the palette must stay usable with no
 * connection, so a line that matches nothing becomes a journal draft rather than waiting on anything remote.
 */
export function QuickCapture({ open, onOpenChange }: QuickCaptureProps): ReactElement {
  const navigate = useNavigate();
  const { today, currency } = useMemoirData();
  const command = useCommand();
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const occurrences = useOccurrenceSearch(text);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onOpenChange(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return setText('');
    field.current?.focus();
  }, [open]);

  const parse = useMemo(() => parseCapture(text, { date: today, currency, occurrences: occurrences.data ?? [] }), [text, today, currency, occurrences.data]);

  const destinations = DESTINATIONS.filter(item => {
    const query = text.trim().toLowerCase();
    if (query.length === 0) return true;
    return item.label.toLowerCase().includes(query) || item.keywords.some(keyword => keyword.includes(query));
  });

  const commit = (draft: CaptureDraft): void => {
    command.mutate(draft.command, {
      onSuccess: result => {
        if (result.status === 'needs-confirmation') return;
        toast.neutral(result.message);
        setText('');
        onOpenChange(false);
      },
    });
  };

  return (
    <OverlaySurface open={open} onOpenChange={onOpenChange} title="Quick capture" size="md">
      <div className={styles.body}>
        <Input
          value={text}
          onValueChange={setText}
          placeholder="coffee 4.20 · 8000 steps · 78.4 kg · j had a good morning"
          aria-label="Log something, or jump to a screen"
          ref={field}
          clearable
        />

        {parse.status === 'draft' ? <ParseBand draft={parse.draft} onCommit={commit} /> : null}

        {parse.status === 'ambiguous' ? (
          <div className={styles.candidates}>
            <p className={styles.sectionLabel}>That could be two things. Pick one — nothing is saved until you do.</p>
            {parse.candidates.map(candidate => (
              <button key={candidate.kind} type="button" className={styles.candidate} onClick={() => commit(candidate)}>
                <Badge variant="outline" size="sm">
                  {candidate.kindLabel}
                </Badge>
                <span className={styles.candidateText}>{candidate.fields.map(field => field.value).join(' · ')}</span>
              </button>
            ))}
          </div>
        ) : null}

        {parse.status === 'unrecognised' ? <p className={styles.sectionLabel}>Nothing in that line matched a quest. Type a number with a unit, or pick a screen below.</p> : null}

        {destinations.length === 0 ? null : (
          <div>
            <p className={styles.sectionLabel}>Go to</p>
            <ul className={styles.destinations}>
              {destinations.map(item => (
                <li key={item.to}>
                  <button
                    type="button"
                    className={styles.destination}
                    onClick={() => {
                      onOpenChange(false);
                      void navigate({ to: item.to });
                    }}
                  >
                    <span className={styles.destinationIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className={styles.footerHint}>
          <Kbd>Esc</Kbd> closes this. <Kbd keys="mod+K" /> reopens it from anywhere.
        </p>
      </div>
    </OverlaySurface>
  );
}

function ParseBand({ draft, onCommit }: { draft: CaptureDraft; onCommit: (draft: CaptureDraft) => void }): ReactElement {
  return (
    <div className={styles.parse}>
      <div className={styles.parseHead}>
        <Badge variant="soft" intent="info">
          {draft.kindLabel}
        </Badge>
        <span className={styles.parseHint}>{draft.hint}</span>
      </div>
      <div className={styles.parseFields}>
        {draft.fields.map(field => (
          <div key={field.label}>
            <p className={styles.fieldLabel}>{field.label}</p>
            <p className={styles.fieldValue} data-mono={field.mono === true}>
              {field.value}
            </p>
            {field.guessed ? <p className={styles.fieldGuess}>assumed — edit after saving</p> : null}
          </div>
        ))}
      </div>
      {draft.warning ? <p className={styles.parseWarning}>{draft.warning}</p> : null}
      <div className={styles.parseActions}>
        <Button size="sm" variant="primary" onClick={() => onCommit(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}
