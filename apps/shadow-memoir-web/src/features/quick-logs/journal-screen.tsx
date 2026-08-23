import { type ReactElement, useRef, useState } from 'react';
import { Button, Card, EmptyState, Input, Skeleton, Statistic, Textarea, toast } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import { SparkBars } from '@/components/SparkBars';
import { SearchIcon } from '@/components/icons';
import {
  applyMarkdownTool,
  type EntryCapAdvisory,
  journalExcerpt,
  type MarkdownTool,
  moodOption,
  type MoodValence,
  todayISODate,
  useJournal,
  useQuickLogCommand,
} from '@/lib/data';

import { MoodPicker } from './mood-picker';
import styles from './quick-logs.module.css';

const TOOLS: { tool: MarkdownTool; glyph: string; label: string }[] = [
  { tool: 'bold', glyph: 'B', label: 'Bold' },
  { tool: 'italic', glyph: 'I', label: 'Italic' },
  { tool: 'quote', glyph: '“', label: 'Quote' },
  { tool: 'list', glyph: '•', label: 'List' },
  { tool: 'heading', glyph: 'H', label: 'Heading' },
];

export function JournalScreen(): ReactElement {
  const journal = useJournal();
  const command = useQuickLogCommand();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<MoodValence | null>(3);
  const [search, setSearch] = useState('');
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);

  const view = journal.data;

  const runTool = (tool: MarkdownTool): void => {
    const field = editorRef.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? text.length;
    const edit = applyMarkdownTool(text, start, end, tool);
    setText(edit.text);
    requestAnimationFrame(() => field?.setSelectionRange(edit.selectionStart, edit.selectionEnd));
  };

  const save = (): void => {
    if (!text.trim()) return;
    command.mutate(
      { type: 'journal.save', draft: { date: todayISODate(), text, mood } },
      {
        onSuccess: result => {
          setAdvisory(result.advisory ?? null);
          toast.success(result.reward?.rewarded ? `${result.message} First of the day — +${result.reward.xp} XP.` : result.message);
          setText('');
        },
      },
    );
  };

  const entries = view?.entries.filter(entry => entry.text.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

  if (journal.isLoading || !view) return <Skeleton.Card />;

  return (
    <section className={styles.screen} aria-labelledby="journal-title">
      <h2 className={styles.cardTitle} id="journal-title">
        Journal
      </h2>

      <div className={styles.split}>
        <div className={styles.column}>
          {view.prompt && (
            <Card padding="md">
              <div className={styles.pad}>
                <p className={styles.eyebrow}>Today’s prompt · optional</p>
                <p className={styles.promptQuestion}>{view.prompt.question}</p>
                <div className={styles.actions}>
                  <Button size="sm" variant="secondary" onClick={() => editorRef.current?.focus()}>
                    Write on this
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => command.mutate({ type: 'journal.dismissPrompt' })}>
                    Not today
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card padding="lg">
            <div className={styles.padLg}>
              <div className={styles.cardHead}>
                <div>
                  <h3 className={styles.cardTitle}>{todayISODate()}</h3>
                  <p className={styles.hint}>{view.draftNote}</p>
                </div>
                <MoodPicker value={mood} onChange={setMood} />
              </div>

              <div className={styles.editorToolbar}>
                {TOOLS.map(item => (
                  <button key={item.tool} type="button" className={styles.toolButton} aria-label={item.label} onClick={() => runTool(item.tool)}>
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
                onValueChange={setText}
                aria-label="Journal entry"
                placeholder="Write as much or as little as you like. One line counts."
              />

              <div className={styles.actions}>
                <Button variant="primary" loading={command.isPending} disabled={!text.trim()} onClick={save}>
                  Save entry
                </Button>
                <span className={styles.hint}>{mood === null ? 'Mood is optional' : `Mood: ${moodOption(mood)?.label}`}</span>
              </div>

              <EntryCapNote advisory={advisory} />
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle}>{view.totalEntries} entries</h3>
                <Input
                  size="sm"
                  placeholder="Search entries"
                  aria-label="Search journal entries"
                  prefix={<SearchIcon size={14} />}
                  value={search}
                  onValueChange={setSearch}
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

              {entries.map(entry => (
                <article key={entry.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.cardHead} style={{ marginBottom: 0 }}>
                      <span className={styles.rowStamp}>{entry.date}</span>
                      <span className={styles.rowName}>{entry.title}</span>
                      <span className={styles.hint}>
                        {moodOption(entry.mood)?.label ?? 'No mood'} · {entry.wordCount} words
                      </span>
                    </div>
                    <p className={styles.excerpt}>{journalExcerpt(entry.text)}</p>
                  </div>
                </article>
              ))}
            </div>
          </Card>
        </div>

        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>Writing</h3>
              <Statistic label="Current streak" value={view.writingStreakDays} unit="days" size="sm" />
              <SparkBars values={view.last28Days.map(day => day.value)} label={`Last 28 days of writing`} height={16} />
              <p className={styles.hint}>Last 28 days · {view.last28Days.filter(day => day.value !== null).length} written</p>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>Mood over the month</h3>
              <SparkBars values={view.moodTrend.map(day => day.value)} label="Mood over the month" height={60} />
              <p className={styles.prose}>{view.moodNote}</p>
            </div>
          </Card>

          {view.onThisDay && (
            <Card padding="md">
              <div className={styles.pad}>
                <h3 className={styles.railTitle}>On this day</h3>
                <p className={styles.prose}>
                  {view.onThisDay.year}: “{view.onThisDay.excerpt}”
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
