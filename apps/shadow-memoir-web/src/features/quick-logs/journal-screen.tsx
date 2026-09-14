import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, Input, Skeleton, Statistic, Textarea } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { EntryCapNote } from '@/components/EntryCapNote';
import { LinkageOfferNote } from '@/components/LinkageOfferNote';
import { SparkBars } from '@/components/SparkBars';
import { SearchIcon } from '@/components/icons';
import {
  applyMarkdownTool,
  type EntryCapAdvisory,
  failureCopy,
  journalExcerpt,
  type JournalView,
  type MarkdownTool,
  moodOption,
  type MoodValence,
  notifyOutcome,
  type QuestLinkageOffer,
  todayISODate,
  useJournal,
  useMemoirData,
  useQuickLogCommand,
} from '@/lib/data';
import { formatCount, formatLocalDate } from '@/lib/format';

import { MoodPicker } from './mood-picker';
import styles from './quick-logs.module.css';

const TOOLS: { tool: MarkdownTool; glyph: string; label: string }[] = [
  { tool: 'bold', glyph: 'B', label: 'Bold' },
  { tool: 'italic', glyph: 'I', label: 'Italic' },
  { tool: 'quote', glyph: '“', label: 'Quote' },
  { tool: 'list', glyph: '•', label: 'List' },
  { tool: 'heading', glyph: 'H', label: 'Heading' },
];

const ENTRIES_PAGE_SIZE = 20;
const DRAFT_SAVE_DELAY_MS = 400;

export function JournalScreen(): ReactElement {
  const journal = useJournal();
  const command = useQuickLogCommand();
  const { quickLogs } = useMemoirData();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<MoodValence | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(ENTRIES_PAGE_SIZE);
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);
  const [linkage, setLinkage] = useState<QuestLinkageOffer | null>(null);

  const hydratedRef = useRef(false);
  const textRef = useRef(text);
  const moodRef = useRef(mood);
  const dirtyRef = useRef(false);
  const pendingSaveRef = useRef<string | null>(null);
  const debounceHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    textRef.current = text;
    moodRef.current = mood;
  }, [text, mood]);

  useEffect(() => {
    let cancelled = false;
    void quickLogs.readJournalDraft().then(draft => {
      hydratedRef.current = true;
      if (cancelled || !draft || textRef.current.trim()) return;
      setText(draft.text);
      setMood(draft.mood);
      setDraftDate(draft.date);
    });
    return () => {
      cancelled = true;
    };
  }, [quickLogs]);

  useEffect(() => {
    if (pendingSaveRef.current !== null) return;
    const handle = setTimeout(() => {
      debounceHandleRef.current = null;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      if (text.trim()) {
        void quickLogs.saveJournalDraft(text, mood);
        return;
      }
      if (hydratedRef.current) {
        void quickLogs.clearJournalDraft();
        setDraftDate(null);
      }
    }, DRAFT_SAVE_DELAY_MS);
    debounceHandleRef.current = handle;
    return () => clearTimeout(handle);
  }, [text, mood, quickLogs]);

  useEffect(() => {
    const flush = (): void => {
      if (pendingSaveRef.current !== null || !dirtyRef.current) return;
      if (hydratedRef.current && textRef.current.trim()) void quickLogs.saveJournalDraft(textRef.current, moodRef.current);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
    };
  }, [quickLogs]);

  const onSearchChange = (value: string): void => {
    setSearch(value);
    setVisibleCount(ENTRIES_PAGE_SIZE);
  };

  const onTextChange = (value: string): void => {
    dirtyRef.current = true;
    setText(value);
  };

  const onMoodChange = (value: MoodValence | null): void => {
    dirtyRef.current = true;
    setMood(value);
  };

  const runTool = (tool: MarkdownTool): void => {
    const field = editorRef.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? text.length;
    const edit = applyMarkdownTool(text, start, end, tool);
    onTextChange(edit.text);
    requestAnimationFrame(() => field?.setSelectionRange(edit.selectionStart, edit.selectionEnd));
  };

  const [writingDraft, setWritingDraft] = useState(false);
  const saving = writingDraft || command.isPendingFor(cmd => cmd.type === 'journal.save');

  const save = async (): Promise<void> => {
    if (saving || !text.trim()) return;
    const draftText = text;
    const draftMood = mood;
    const subject = journalExcerpt(draftText, 24) || todayISODate();

    if (debounceHandleRef.current) clearTimeout(debounceHandleRef.current);
    debounceHandleRef.current = null;
    dirtyRef.current = false;
    pendingSaveRef.current = draftText;
    setWritingDraft(true);
    await quickLogs.saveJournalDraft(draftText, draftMood).catch(() => undefined);

    const running = command.run({ type: 'journal.save', draft: { date: todayISODate(), text: draftText, mood: draftMood } }).catch(() => null);
    setWritingDraft(false);
    const outcome = await running;
    pendingSaveRef.current = null;

    if (!outcome) {
      notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { action: 'save', subject, success: '' });
      void quickLogs.saveJournalDraft(draftText, draftMood);
      return;
    }
    if (outcome.status === 'needs-confirmation') return;

    if (outcome.status === 'applied' || outcome.status === 'queued-offline') {
      const message = outcome.local.reward?.rewarded ? `${outcome.local.message} First of the day — +${outcome.local.reward.xp} XP.` : outcome.local.message;
      notifyOutcome(outcome, { action: 'save', subject, success: message });
      setAdvisory(outcome.local.advisory ?? null);
      setLinkage(outcome.local.linkageOffer ?? null);
      setText('');
      setDraftDate(null);
      return;
    }

    notifyOutcome(outcome, { action: 'save', subject, success: '' });
    void quickLogs.saveJournalDraft(draftText, draftMood);
  };

  const dismissPrompt = async (): Promise<void> => {
    const outcome = await command.run({ type: 'journal.dismissPrompt' }).catch(() => null);
    if (!outcome) {
      notifyOutcome({ status: 'failed', message: failureCopy(null), code: null, undone: false }, { action: 'dismiss', subject: 'prompt', success: '' });
      return;
    }
    if (outcome.status === 'needs-confirmation') return;
    notifyOutcome(outcome, { action: 'dismiss', subject: 'prompt', success: outcome.status === 'applied' ? outcome.local.message : '' });
  };

  return (
    <section className={styles.screen} aria-labelledby="journal-title">
      <h2 className={styles.cardTitle} id="journal-title">
        Journal
      </h2>

      <DataState query={journal} skeleton={<Skeleton.Card />}>
        {view => (
          <JournalContent
            view={view}
            text={text}
            mood={mood}
            draftDate={draftDate}
            search={search}
            visibleCount={visibleCount}
            advisory={advisory}
            linkage={linkage}
            editorRef={editorRef}
            saving={saving}
            onTextChange={onTextChange}
            onMoodChange={onMoodChange}
            onSearchChange={onSearchChange}
            onShowMore={() => setVisibleCount(count => count + ENTRIES_PAGE_SIZE)}
            onRunTool={runTool}
            onSave={() => void save()}
            onDismissPrompt={() => void dismissPrompt()}
          />
        )}
      </DataState>
    </section>
  );
}

interface JournalContentProps {
  view: JournalView;
  text: string;
  mood: MoodValence | null;
  draftDate: string | null;
  search: string;
  visibleCount: number;
  advisory: EntryCapAdvisory | null;
  linkage: QuestLinkageOffer | null;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  saving: boolean;
  onTextChange: (value: string) => void;
  onMoodChange: (value: MoodValence | null) => void;
  onSearchChange: (value: string) => void;
  onShowMore: () => void;
  onRunTool: (tool: MarkdownTool) => void;
  onSave: () => void;
  onDismissPrompt: () => void;
}

function JournalContent({
  view,
  text,
  mood,
  draftDate,
  search,
  visibleCount,
  advisory,
  linkage,
  editorRef,
  saving,
  onTextChange,
  onMoodChange,
  onSearchChange,
  onShowMore,
  onRunTool,
  onSave,
  onDismissPrompt,
}: JournalContentProps): ReactElement {
  const entries = view.entries.filter(entry => entry.text.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleEntries = entries.slice(0, visibleCount);
  const totalLabel = formatCount(view.totalEntries, 'entry', 'entries');
  const heading = search.trim() ? `${entries.length} of ${totalLabel}` : totalLabel;

  const rowsRef = useRef<HTMLDivElement>(null);
  const previousVisibleCountRef = useRef(visibleCount);

  useEffect(() => {
    if (visibleCount > previousVisibleCountRef.current) {
      const target = rowsRef.current?.children[previousVisibleCountRef.current] as HTMLElement | undefined;
      target?.focus();
    }
    previousVisibleCountRef.current = visibleCount;
  }, [visibleCount]);

  return (
    <div className={styles.split}>
      <div className={styles.column}>
        {view.prompt && (
          <Card padding="md">
            <Card.Body>
              <p className={styles.eyebrow}>Today’s prompt · optional</p>
              <p className={styles.promptQuestion}>{view.prompt.question}</p>
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" onClick={() => editorRef.current?.focus()}>
                  Write on this
                </Button>
                <Button size="sm" variant="ghost" onClick={onDismissPrompt}>
                  Not today
                </Button>
              </div>
            </Card.Body>
          </Card>
        )}

        <Card padding="lg">
          <Card.Body>
            <div className={styles.cardHead}>
              <div>
                <h3 className={styles.cardTitle}>{todayISODate()}</h3>
                <p className={styles.hint}>{view.draftNote}</p>
                {draftDate && draftDate !== todayISODate() && <p className={styles.hint}>Draft from {formatLocalDate(draftDate)}</p>}
              </div>
              <MoodPicker value={mood} onChange={onMoodChange} disabled={saving} />
            </div>

            <div className={styles.editorToolbar}>
              {TOOLS.map(item => (
                <button key={item.tool} type="button" className={styles.toolButton} aria-label={item.label} disabled={saving} onClick={() => onRunTool(item.tool)}>
                  {item.glyph}
                </button>
              ))}
              <span className={styles.toolbarHint}>Markdown-lite · **bold**, _italic_, lists, quotes</span>
            </div>

            <Textarea
              ref={editorRef}
              className={styles.editor}
              minRows={10}
              value={text}
              onValueChange={onTextChange}
              readOnly={saving}
              aria-label="Journal entry"
              placeholder="Write as much or as little as you like. One line counts."
            />

            <div className={styles.actions}>
              <Button variant="primary" loading={saving} disabled={!text.trim()} onClick={onSave}>
                Save entry
              </Button>
              <span className={styles.hint}>{mood === null ? 'Mood is optional' : `Mood: ${moodOption(mood)?.label}`}</span>
            </div>

            <EntryCapNote advisory={advisory} />
            <LinkageOfferNote offer={linkage} />
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>{heading}</h3>
              <Input
                size="sm"
                placeholder="Search entries"
                aria-label="Search journal entries"
                prefix={<SearchIcon size={14} />}
                value={search}
                onValueChange={onSearchChange}
                clearable
              />
            </div>

            {entries.length === 0 && (
              <EmptyState
                size="inline"
                title={search ? `Nothing matches “${search}”` : 'No entries yet'}
                description={search ? 'Try a shorter word.' : 'The first one can be a single line.'}
              />
            )}

            <div ref={rowsRef}>
              {visibleEntries.map(entry => (
                <article key={entry.id} className={styles.journalEntry} tabIndex={-1}>
                  <span className={styles.rowStamp}>{entry.date}</span>
                  <div className={styles.journalEntryBody}>
                    <p className={styles.excerpt}>{journalExcerpt(entry.text)}</p>
                    <span className={styles.hint}>
                      {moodOption(entry.mood)?.label ?? 'No mood'} · {entry.wordCount} words
                    </span>
                  </div>
                </article>
              ))}
            </div>

            {entries.length > visibleEntries.length && (
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" onClick={onShowMore}>
                  Show more
                </Button>
              </div>
            )}
          </Card.Body>
        </Card>
      </div>

      <div className={styles.column}>
        <Card padding="md">
          <Card.Body>
            <h3 className={styles.railTitle}>Writing</h3>
            <Statistic label="Current streak" value={view.writingStreakDays} unit="days" size="sm" />
            <SparkBars values={view.last28Days.map(day => day.value)} label={`Last 28 days of writing`} height={16} />
            <p className={styles.hint}>Last 28 days · {view.last28Days.filter(day => day.value !== null).length} written</p>
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <h3 className={styles.railTitle}>Mood over the month</h3>
            <SparkBars
              values={view.moodTrend.map(day => day.value)}
              label="Mood over the month"
              height={60}
              domain={{ min: 1, max: 5 }}
              scale={{ top: 'Bright', bottom: 'Low' }}
              axis={{ start: formatLocalDate(view.moodTrend[0]?.date, { year: false }), end: 'Today' }}
            />
            <p className={styles.prose}>{view.moodNote}</p>
          </Card.Body>
        </Card>

        {view.onThisDay && (
          <Card padding="md">
            <Card.Body>
              <h3 className={styles.railTitle}>On this day</h3>
              <p className={styles.prose}>
                {view.onThisDay.year}: “{view.onThisDay.excerpt}”
              </p>
            </Card.Body>
          </Card>
        )}
      </div>
    </div>
  );
}
