/**
 * Importing npm packages
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, cn, Drawer, Input, Slider, toast, useMediaQuery } from '@shadow-library/ui';
import { useOnlineStatus } from '@shadow-library/web/pwa';

/**
 * Importing user defined packages
 */
import { BackIcon, BookmarkFilledIcon, BookmarkIcon, ChevronRightIcon, ListIcon, PlayIcon, SettingsSlidersIcon, StarIcon, WifiOffIcon } from '@/components/icons';
import {
  chapterListQueryOptions,
  chapterQueryOptions,
  getProgress,
  isInLibrary,
  libraryQueryOptions,
  novelQueryOptions,
  progressKeys,
  readProgressMap,
  saveProgress,
  sessionQueryOptions,
  useToggleLibraryMutation,
} from '@/lib/apis';
import { readLocal, writeLocal } from '@/lib/local-store';
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  loadReaderSettings,
  READER_FONTS,
  READER_PALETTES,
  READER_WIDTHS,
  type ReaderSettings,
  type ReaderTheme,
  saveReaderSettings,
} from '@/lib/reader';

import styles from './reader-screen.module.css';

/**
 * Defining types
 */
const route = getRouteApi('/read/$slug/$ordinal');

/**
 * Declaring the constants
 *
 * The reading surface: its own palette (paper/sepia/ink), sticky progress hairline, top and bottom chrome
 * that hide on tap, live typography settings, a chapter drawer, and end-of-chapter navigation. Progress is
 * written on scroll (debounced) and the next chapter is prefetched so it stays readable offline.
 */

// Brightness is a device-local reading dim, persisted through the same local-store primitive as the other
// reader settings but under its own key so it never rides the synced settings object.
const BRIGHTNESS_KEY = 'webnovel:reader-brightness';
const BRIGHTNESS_MIN = 50;
const BRIGHTNESS_MAX = 100;
const BRIGHTNESS_DEFAULT = 100;

function loadBrightness(): number {
  return readLocal<number>(BRIGHTNESS_KEY, BRIGHTNESS_DEFAULT);
}

export function ReaderScreen(): React.JSX.Element {
  const { slug, ordinal: ordinalParam } = route.useParams();
  const ordinal = Number.parseInt(ordinalParam, 10) || 1;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const isPhone = useMediaQuery('(max-width: 767px)');

  const session = useQuery(sessionQueryOptions());
  const chapter = useQuery(chapterQueryOptions(slug, ordinal));
  const novel = useQuery(novelQueryOptions(slug));
  const library = useQuery(libraryQueryOptions(session.data?.userId));
  const toggleLibrary = useToggleLibraryMutation(session.data?.userId);

  const [settings, setSettings] = useState<ReaderSettings>(loadReaderSettings);
  const [brightness, setBrightness] = useState<number>(loadBrightness);
  const [chrome, setChrome] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [rating, setRating] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);

  const palette = READER_PALETTES[settings.theme];
  const userId = session.data?.userId;
  const inLibrary = isInLibrary(library.data, slug);

  // The chapter body carries `nextOrdinal` but not the next chapter's title, so read it off the shared
  // chapter-list query (the drawer already caches it) rather than widening the chapter contract.
  const nextOrdinal = chapter.data?.nextOrdinal;
  const nextChapters = useQuery({ ...chapterListQueryOptions(slug, nextOrdinal ? Math.ceil(nextOrdinal / 100) : 1, 100), enabled: !!nextOrdinal });
  const nextTitle = nextOrdinal ? nextChapters.data?.items.find(item => item.ordinal === nextOrdinal)?.title : undefined;

  const updateSettings = (updates: Partial<ReaderSettings>): void => {
    setSettings(current => {
      const next = { ...current, ...updates };
      saveReaderSettings(next);
      return next;
    });
  };

  const updateBrightness = (value: number): void => {
    setBrightness(value);
    writeLocal(BRIGHTNESS_KEY, value);
  };

  const submitRating = (value: number): void => {
    setRating(value);
    toast.success(`Thanks for rating — ${value} star${value === 1 ? '' : 's'}.`);
  };

  const downloadOffline = (): void => {
    toast.warning('You’re offline. Reconnect to download this chapter for offline reading.');
  };

  // Track scroll → progress hairline + persisted reading position (debounced, local-first).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const onScroll = (): void => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.round((doc.scrollTop / max) * 100)) : 0;
      setScrollPct(pct);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveProgress(slug, ordinal, pct, userId);
        queryClient.setQueryData(progressKeys.all, readProgressMap(userId));
      }, 800);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(saveTimer.current);
    };
  }, [slug, ordinal, userId, queryClient]);

  // Restore the saved position once the chapter is on screen, and prefetch the next chapter.
  useEffect(() => {
    if (!chapter.data) return;
    const saved = getProgress(slug, userId);
    if (saved && saved.ordinal === ordinal && saved.position > 2) {
      const doc = document.documentElement;
      window.scrollTo({ top: ((doc.scrollHeight - doc.clientHeight) * saved.position) / 100 });
    } else {
      window.scrollTo({ top: 0 });
    }
    if (chapter.data.nextOrdinal) void queryClient.prefetchQuery(chapterQueryOptions(slug, chapter.data.nextOrdinal));
  }, [chapter.data, slug, ordinal, userId, queryClient]);

  const goTo = (target: number): void => {
    void navigate({ to: '/read/$slug/$ordinal', params: { slug, ordinal: String(target) } });
  };

  const offlineBlocked = chapter.isError && !online;

  return (
    <div className={styles.surface} style={{ background: palette.bg, color: palette.fg }}>
      <div className={styles.progressTrack} style={{ background: palette.hairline }}>
        <div className={styles.progressFill} style={{ width: `${scrollPct}%` }} />
      </div>

      {chrome && (
        <div className={`${styles.topChrome} wn-fade`} style={{ background: palette.bg, borderBottom: `1px solid ${palette.hairline}` }}>
          <Link to="/novels/$slug" params={{ slug }} aria-label="Back to novel" className={styles.chromeBtn} style={{ color: 'inherit' }}>
            <BackIcon size={20} />
          </Link>
          <div className={styles.chromeTitleBox}>
            <div className={styles.chromeTitle}>{chapter.data?.novelTitle ?? novel.data?.title ?? ''}</div>
            <div className={styles.chromeSub}>
              Ch. {ordinal.toLocaleString()}
              {chapter.data ? ` · ${chapter.data.title}` : ''}
            </div>
          </div>
          {!isPhone && (
            <button
              type="button"
              aria-label={inLibrary ? 'Remove from library' : 'Add to library'}
              className={styles.chromeBtn}
              onClick={() => novel.data && toggleLibrary.mutate(novel.data)}
            >
              {inLibrary ? <BookmarkFilledIcon size={18} /> : <BookmarkIcon size={18} />}
            </button>
          )}
          <button type="button" aria-label="Chapters" className={styles.chromeBtn} onClick={() => setChaptersOpen(true)}>
            <ListIcon size={19} />
          </button>
          <button type="button" aria-label="Reading settings" className={styles.chromeBtn} onClick={() => setSettingsOpen(true)}>
            <SettingsSlidersIcon size={19} />
          </button>
        </div>
      )}

      {offlineBlocked && (
        <div className={styles.blocked}>
          <div className={styles.blockedMark} style={{ background: palette.hairline }}>
            <WifiOffIcon size={28} />
          </div>
          <h2 className={styles.blockedTitle}>This chapter isn’t downloaded</h2>
          <p className={styles.blockedText}>
            You’re offline and Chapter {ordinal.toLocaleString()} isn’t available on this device. Reconnect to read it, or download it for offline access.
          </p>
          <div className={styles.blockedActions}>
            <Button variant="primary" onClick={() => void chapter.refetch()}>
              Try to reconnect
            </Button>
            <Button variant="secondary" onClick={downloadOffline}>
              Download
            </Button>
          </div>
          <Link to="/downloads" className={styles.blockedLink}>
            Go to offline library
          </Link>
        </div>
      )}

      {chapter.data && (
        // Tap-anywhere chrome toggle — a redundant pointer affordance (the chrome buttons remain the
        // accessible path), so the wrapper is presentational rather than a focusable control.
        <div role="presentation" style={{ filter: `brightness(${brightness / 100})` }} onClick={() => setChrome(value => !value)}>
          <article
            className={styles.article}
            style={{
              maxWidth: READER_WIDTHS[settings.width],
              fontFamily: READER_FONTS[settings.font],
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
              textAlign: settings.align,
            }}
          >
            <header className={styles.chapterHead} style={{ borderBottom: `1px solid ${palette.hairline}` }}>
              <div className={styles.chapterKicker}>Chapter {ordinal.toLocaleString()}</div>
              <h1 className={styles.chapterTitle}>{chapter.data.title}</h1>
            </header>
            {chapter.data.paragraphs.map((paragraph, index) => (
              <p key={index} style={{ margin: `0 0 ${settings.fontSize}px` }}>
                {paragraph}
              </p>
            ))}
          </article>

          <div role="presentation" className={styles.footer} style={{ maxWidth: READER_WIDTHS[settings.width] }} onClick={event => event.stopPropagation()}>
            <div className={styles.endMark} style={{ borderTop: `1px solid ${palette.hairline}`, borderBottom: `1px solid ${palette.hairline}` }}>
              <div className={styles.endMarkLabel}>End of Chapter {ordinal.toLocaleString()}</div>
              <div className={styles.reviewPrompt}>
                <span className={styles.reviewPromptText}>Enjoying this?</span>
                <div className={styles.reviewStars} role="radiogroup" aria-label="Rate this novel">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={rating === star}
                      aria-label={`Rate ${star} star${star === 1 ? '' : 's'}`}
                      className={cn(styles.reviewStar, star <= (hoverStar || rating) && styles.reviewStarOn)}
                      onMouseEnter={() => setHoverStar(star)}
                      onMouseLeave={() => setHoverStar(0)}
                      onClick={() => submitRating(star)}
                    >
                      <StarIcon size={20} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {chapter.data.nextOrdinal ? (
              <button
                type="button"
                className={styles.nextCard}
                style={{ background: palette.hairline, borderColor: palette.hairline }}
                onClick={() => chapter.data?.nextOrdinal && goTo(chapter.data.nextOrdinal)}
              >
                <span
                  className={styles.nextCardCoverBox}
                  style={{ background: novel.data ? `linear-gradient(158deg, ${novel.data.cover.from}, ${novel.data.cover.to})` : 'var(--sh-accent)' }}
                >
                  <PlayIcon size={18} />
                </span>
                <span className={styles.nextCardBody}>
                  <span className={styles.nextCardKicker}>Up next · Chapter {chapter.data.nextOrdinal.toLocaleString()}</span>
                  <span className={styles.nextCardTitle}>{nextTitle ?? 'Continue reading'}</span>
                </span>
                <ChevronRightIcon size={20} />
              </button>
            ) : (
              <div className={styles.caughtUp} style={{ background: palette.hairline }}>
                <div className={styles.caughtUpTitle}>You’re all caught up</div>
                <div className={styles.caughtUpSub}>This is the latest chapter. New chapters release regularly.</div>
              </div>
            )}
            <div className={styles.footRow}>
              <button
                type="button"
                className={styles.footBtn}
                style={{ border: `1px solid ${palette.hairline}` }}
                disabled={!chapter.data.previousOrdinal}
                onClick={() => chapter.data?.previousOrdinal && goTo(chapter.data.previousOrdinal)}
              >
                <BackIcon size={15} /> Previous
              </button>
              <button type="button" className={cn(styles.footBtn, styles.footBtnFixed)} style={{ border: `1px solid ${palette.hairline}` }} onClick={() => setChaptersOpen(true)}>
                Chapters
              </button>
              <button
                type="button"
                className={cn(styles.footBtn, styles.footBtnFixed)}
                style={{ border: `1px solid ${palette.hairline}` }}
                onClick={() => void navigate({ to: '/novels/$slug', params: { slug } })}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Comments
              </button>
            </div>
          </div>
        </div>
      )}

      {chrome && chapter.data && (
        <div className={`${styles.bottomChrome} wn-fade`} style={{ background: palette.bg, borderTop: `1px solid ${palette.hairline}` }}>
          {isPhone && (
            <div className={styles.bottomActions}>
              <button type="button" className={styles.bottomActionBtn} onClick={() => setChaptersOpen(true)}>
                <ListIcon size={20} />
                Chapters
              </button>
              <button type="button" className={styles.bottomActionBtn} onClick={() => setSettingsOpen(true)}>
                <SettingsSlidersIcon size={20} />
                Display
              </button>
              <button type="button" className={styles.bottomActionBtn} onClick={() => novel.data && toggleLibrary.mutate(novel.data)}>
                {inLibrary ? <BookmarkFilledIcon size={20} /> : <BookmarkIcon size={20} />}
                Library
              </button>
            </div>
          )}
          <div className={styles.bottomNav}>
            <button
              type="button"
              aria-label="Previous chapter"
              className={styles.chromeBtn}
              disabled={!chapter.data.previousOrdinal}
              onClick={() => chapter.data?.previousOrdinal && goTo(chapter.data.previousOrdinal)}
            >
              <BackIcon size={20} />
            </button>
            <button type="button" className={styles.bottomNavInfo} onClick={() => setChaptersOpen(true)}>
              <ListIcon size={15} />
              Ch. {ordinal.toLocaleString()} of {chapter.data.totalChapters.toLocaleString()} · {scrollPct}%
            </button>
            <button
              type="button"
              aria-label="Next chapter"
              className={styles.chromeBtn}
              disabled={!chapter.data.nextOrdinal}
              onClick={() => chapter.data?.nextOrdinal && goTo(chapter.data.nextOrdinal)}
            >
              <ChevronRightIcon size={20} />
            </button>
          </div>
        </div>
      )}

      <ReaderSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={updateSettings}
        brightness={brightness}
        onBrightnessChange={updateBrightness}
        isPhone={isPhone}
      />
      <ChapterDrawer
        open={chaptersOpen}
        onOpenChange={setChaptersOpen}
        slug={slug}
        ordinal={ordinal}
        total={chapter.data?.totalChapters ?? novel.data?.chapterCount ?? 0}
        onGoTo={goTo}
      />
    </div>
  );
}

interface ReaderSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ReaderSettings;
  onChange: (updates: Partial<ReaderSettings>) => void;
  brightness: number;
  onBrightnessChange: (value: number) => void;
  isPhone: boolean;
}

const THEME_OPTIONS: ReaderTheme[] = ['light', 'sepia', 'dark'];

function ReaderSettingsSheet(props: ReaderSettingsSheetProps): React.JSX.Element {
  const { settings, onChange } = props;
  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} placement={props.isPhone ? 'bottom' : 'right'} aria-label="Reading settings">
      <Drawer.Header title="Reading settings" />
      <Drawer.Body>
        <div className={styles.settingsGroup}>
          <div className={styles.settingsLabel}>Theme</div>
          <div className={styles.themeRow}>
            {THEME_OPTIONS.map(theme => (
              <button
                key={theme}
                type="button"
                aria-label={`${theme} theme`}
                className={cn(styles.themeSwatch, settings.theme === theme && styles.themeSwatchOn)}
                style={{ background: READER_PALETTES[theme].bg, color: READER_PALETTES[theme].fg }}
                onClick={() => onChange({ theme })}
              >
                Aa
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <div className={styles.settingsLabel}>Font</div>
          <div className={styles.optionRow}>
            <button type="button" className={cn(styles.optionBtn, settings.font === 'serif' && styles.optionBtnOn)} onClick={() => onChange({ font: 'serif' })}>
              Serif
            </button>
            <button type="button" className={cn(styles.optionBtn, settings.font === 'sans' && styles.optionBtnOn)} onClick={() => onChange({ font: 'sans' })}>
              Sans
            </button>
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <div className={styles.settingsLabel}>Font size</div>
          <div className={styles.sizeRow}>
            <button
              type="button"
              aria-label="Smaller text"
              className={styles.sizeBtn}
              style={{ fontSize: 15 }}
              onClick={() => onChange({ fontSize: Math.max(FONT_SIZE_MIN, settings.fontSize - 1) })}
            >
              A−
            </button>
            <span className={styles.sizeValue}>{settings.fontSize}px</span>
            <button
              type="button"
              aria-label="Larger text"
              className={styles.sizeBtn}
              style={{ fontSize: 22 }}
              onClick={() => onChange({ fontSize: Math.min(FONT_SIZE_MAX, settings.fontSize + 1) })}
            >
              A+
            </button>
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <Slider
            label="Line height"
            value={settings.lineHeight}
            min={1.4}
            max={2.2}
            step={0.05}
            formatValue={value => value.toFixed(2)}
            onValueChange={value => onChange({ lineHeight: Array.isArray(value) ? (value[0] ?? settings.lineHeight) : value })}
            aria-label="Line height"
          />
        </div>

        <div className={styles.settingsGroup}>
          <div className={styles.settingsLabel}>Text width</div>
          <div className={styles.optionRow}>
            {(['narrow', 'normal', 'wide'] as const).map(width => (
              <button key={width} type="button" className={cn(styles.optionBtn, settings.width === width && styles.optionBtnOn)} onClick={() => onChange({ width })}>
                {width.charAt(0).toUpperCase() + width.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <div className={styles.settingsLabel}>Alignment</div>
          <div className={styles.optionRow}>
            <button type="button" className={cn(styles.optionBtn, settings.align === 'left' && styles.optionBtnOn)} onClick={() => onChange({ align: 'left' })}>
              Left
            </button>
            <button type="button" className={cn(styles.optionBtn, settings.align === 'justify' && styles.optionBtnOn)} onClick={() => onChange({ align: 'justify' })}>
              Justified
            </button>
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <Slider
            label="Brightness"
            value={props.brightness}
            min={BRIGHTNESS_MIN}
            max={BRIGHTNESS_MAX}
            step={5}
            formatValue={value => `${Math.round(value)}%`}
            onValueChange={value => props.onBrightnessChange(Array.isArray(value) ? (value[0] ?? props.brightness) : value)}
            aria-label="Brightness"
          />
        </div>
      </Drawer.Body>
    </Drawer>
  );
}

interface ChapterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  ordinal: number;
  total: number;
  onGoTo: (ordinal: number) => void;
}

function ChapterDrawer(props: ChapterDrawerProps): React.JSX.Element {
  const [jump, setJump] = useState('');
  const page = Math.max(1, Math.ceil(props.ordinal / 100));
  const chapters = useQuery({ ...chapterListQueryOptions(props.slug, page, 100), enabled: props.open });

  const rows = useMemo(() => chapters.data?.items ?? [], [chapters.data]);

  const onJump = (): void => {
    const target = Number.parseInt(jump, 10);
    if (!Number.isFinite(target) || target < 1 || target > props.total) {
      toast.warning(`Enter a chapter between 1 and ${props.total.toLocaleString()}`);
      return;
    }
    props.onOpenChange(false);
    props.onGoTo(target);
  };

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange} placement="right" aria-label="Chapters">
      <Drawer.Header title="Chapters" meta={`${props.total.toLocaleString()} chapters`} />
      <div className={styles.drawerJump}>
        <div style={{ flex: 1 }}>
          <Input value={jump} onValueChange={setJump} placeholder="Go to chapter #" aria-label="Jump to chapter" onKeyDown={event => event.key === 'Enter' && onJump()} />
        </div>
        <Button variant="primary" onClick={onJump}>
          Go
        </Button>
      </div>
      <Drawer.Body style={{ padding: 0 }}>
        {rows.map(chapter => (
          <div
            key={chapter.ordinal}
            role="button"
            tabIndex={0}
            className={cn(styles.drawerRow, chapter.ordinal === props.ordinal && styles.drawerRowCurrent)}
            onClick={() => {
              props.onOpenChange(false);
              props.onGoTo(chapter.ordinal);
            }}
            onKeyDown={event => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              props.onOpenChange(false);
              props.onGoTo(chapter.ordinal);
            }}
          >
            <span className={styles.drawerNum}>{chapter.ordinal.toLocaleString()}</span>
            <span className={styles.drawerTitle}>{chapter.title}</span>
            {chapter.ordinal === props.ordinal && <Badge intent="info">Reading</Badge>}
          </div>
        ))}
      </Drawer.Body>
    </Drawer>
  );
}
