/**
 * Importing npm packages
 */
import { getRouteApi, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, ConfirmDialog, SegmentedControl, Select, Switch, type ThemeMode, toast, useTheme } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { BookIcon, ChevronRightIcon, SettingsSlidersIcon } from '@/components/icons';
import { APP_LANGUAGES, clearAllLocalData, DEFAULT_SETTINGS, loadSettings, saveSettings, type ToggleKey, type WebnovelSettings } from '@/lib/settings-store';

import styles from './settings-screen.module.css';

/**
 * Defining types
 */
export type SettingsSection = 'appearance' | 'reader' | 'downloads' | 'notifications' | 'data' | 'content' | 'about';

export interface SettingsSearch {
  section: SettingsSection;
}

interface ToggleMeta {
  key: ToggleKey;
  label: string;
  description: string;
}

interface ThemeOption {
  value: ThemeMode;
  label: string;
}

/**
 * Declaring the constants
 *
 * The account-agnostic preferences screen from the mockups: a sticky left rail of sections and a right pane
 * of controls. Every toggle and select is device-local (persisted through `settings-store`), except the theme
 * picker: theme is a platform-wide preference shared with the other Shadow apps, so it reads and writes the
 * design-system `useTheme` directly rather than keeping a second copy here that could disagree with it.
 */
export const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'reader', label: 'Reader defaults' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'data', label: 'Data & storage' },
  { id: 'content', label: 'Content & spoilers' },
  { id: 'about', label: 'About & legal' },
];

export const SETTINGS_SECTION_IDS = SETTINGS_SECTIONS.map(section => section.id);

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const DOWNLOAD_TOGGLES: ToggleMeta[] = [
  { key: 'wifiOnlyDownloads', label: 'Download over Wi-Fi only', description: 'Pause downloads on cellular to keep your data plan intact.' },
  { key: 'autoDownloadNewChapters', label: 'Auto-download new chapters', description: 'Fetch new chapters of library novels in the background.' },
];

const NOTIFICATION_TOGGLES: ToggleMeta[] = [
  { key: 'notifyNewChapters', label: 'New chapter releases', description: 'When a novel in your library updates.' },
  { key: 'notifyCommentReplies', label: 'Replies to your comments', description: 'When another reader responds to you.' },
  { key: 'notifyDownloadComplete', label: 'Download complete', description: 'When an offline download finishes.' },
  { key: 'notifyProductNews', label: 'Product news', description: 'Occasional updates about Shadow Webnovel.' },
];

const DATA_TOGGLES: ToggleMeta[] = [
  { key: 'saveReadingHistory', label: 'Save reading history on this device', description: 'Remember where you left off across sessions.' },
  { key: 'cacheCoversOffline', label: 'Cache covers for offline use', description: 'Keep cover images available without a connection.' },
];

const CONTENT_TOGGLES: ToggleMeta[] = [
  { key: 'showMatureContent', label: 'Show mature content', description: 'Include 18+ titles in browse and search results.' },
  { key: 'blurSpoilerTags', label: 'Blur spoiler tags', description: 'Hide spoiler-marked text until you reveal it.' },
  { key: 'markReadOnScroll', label: 'Mark chapters read on scroll', description: 'Mark a chapter finished once you reach the end.' },
];

const route = getRouteApi('/_shell/settings');

function ToggleList({ toggles, settings, onToggle }: { toggles: ToggleMeta[]; settings: WebnovelSettings; onToggle: (key: ToggleKey, value: boolean) => void }): React.JSX.Element {
  return (
    <div className={styles.rows}>
      {toggles.map(toggle => (
        <Switch
          key={toggle.key}
          className={styles.row}
          label={toggle.label}
          description={toggle.description}
          checked={settings[toggle.key]}
          onCheckedChange={value => onToggle(toggle.key, value)}
        />
      ))}
    </div>
  );
}

export function SettingsScreen(): React.JSX.Element {
  const { section } = route.useSearch();
  const navigate = route.useNavigate();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Deterministic defaults render on the server and through the hydration pass; the persisted preferences load
  // in an effect afterwards, so the first client render always matches the server HTML.
  const [settings, setSettings] = useState<WebnovelSettings>(DEFAULT_SETTINGS);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => setSettings(loadSettings()), []);

  const patch = useCallback(<K extends keyof WebnovelSettings>(key: K, value: WebnovelSettings[K]): void => {
    setSettings(current => {
      const next: WebnovelSettings = { ...current, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const onToggle = useCallback((key: ToggleKey, value: boolean): void => patch(key, value), [patch]);

  const onClearData = (): void => {
    clearAllLocalData();
    setSettings(DEFAULT_SETTINGS);
    setThemeMode('system');
    setConfirmOpen(false);
    toast.success('Cleared all local data from this device');
  };

  return (
    <div className={`${styles.page} wn-fade`}>
      <h1 className={styles.title}>Settings</h1>

      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(item => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => void navigate({ search: { section: item.id } })}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.pane}>
          {section === 'appearance' && (
            <section aria-label="Appearance">
              <h2 className={styles.sectionTitle}>Appearance</h2>
              <p className={styles.sectionDesc}>How the app looks. Reading-page typography lives under Reader defaults.</p>
              <div className={styles.fieldLabel}>Theme</div>
              <SegmentedControl className={styles.segmented} fullWidth aria-label="Theme" value={themeMode} onValueChange={value => setThemeMode(value as ThemeMode)}>
                {THEME_OPTIONS.map(option => (
                  <SegmentedControl.Item key={option.value} value={option.value}>
                    {option.label}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl>
            </section>
          )}

          {section === 'reader' && (
            <section aria-label="Reader defaults">
              <h2 className={styles.sectionTitle}>Reader defaults</h2>
              <p className={styles.sectionDesc}>Font, size, line height, width, theme and brightness live on the reading page — adjust them live while reading.</p>
              <Card>
                <Card.Body className={styles.infoCard}>
                  <span className={styles.cardIcon}>
                    <SettingsSlidersIcon size={22} />
                  </span>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitle}>Open the reader to customize</div>
                    <div className={styles.cardMeta}>Typography and page controls appear in the reading toolbar.</div>
                  </div>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/browse">Browse novels</Link>
                  </Button>
                </Card.Body>
              </Card>
            </section>
          )}

          {section === 'downloads' && (
            <section aria-label="Downloads">
              <h2 className={styles.sectionTitle}>Downloads</h2>
              <ToggleList toggles={DOWNLOAD_TOGGLES} settings={settings} onToggle={onToggle} />
              <div className={styles.actions}>
                <Button variant="secondary" asChild>
                  <Link to="/downloads">Manage offline library</Link>
                </Button>
              </div>
            </section>
          )}

          {section === 'notifications' && (
            <section aria-label="Notifications">
              <h2 className={styles.sectionTitle}>Notifications</h2>
              <p className={styles.sectionDesc}>Choose what appears in your in-app Updates. System permission is requested by your device separately.</p>
              <ToggleList toggles={NOTIFICATION_TOGGLES} settings={settings} onToggle={onToggle} />
            </section>
          )}

          {section === 'data' && (
            <section aria-label="Data and storage">
              <h2 className={styles.sectionTitle}>Data &amp; storage</h2>
              <ToggleList toggles={DATA_TOGGLES} settings={settings} onToggle={onToggle} />
              <button type="button" className={styles.dangerButton} onClick={() => setConfirmOpen(true)}>
                Clear all local data
              </button>
              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                intent="danger"
                title="Clear all local data?"
                description="This removes your on-device settings, library, reading history and reader preferences from this browser. Downloaded chapters and synced account data are unaffected. This cannot be undone."
                confirmLabel="Clear data"
                onConfirm={onClearData}
              />
            </section>
          )}

          {section === 'content' && (
            <section aria-label="Content and spoilers">
              <h2 className={styles.sectionTitle}>Content &amp; spoilers</h2>
              <ToggleList toggles={CONTENT_TOGGLES} settings={settings} onToggle={onToggle} />
              <div className={styles.selectField}>
                <div className={styles.fieldLabel}>App language</div>
                <Select value={settings.appLanguage} onValueChange={value => patch('appLanguage', value)} aria-label="App language">
                  {APP_LANGUAGES.map(language => (
                    <Select.Item key={language} value={language}>
                      {language}
                    </Select.Item>
                  ))}
                </Select>
              </div>
            </section>
          )}

          {section === 'about' && (
            <section aria-label="About and legal">
              <h2 className={styles.sectionTitle}>About &amp; legal</h2>
              <Card className={styles.aboutCard}>
                <Card.Body className={styles.infoCard}>
                  <span className={styles.cardIconBrand}>
                    <BookIcon size={24} />
                  </span>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitle}>Shadow Webnovel v2.4.0</div>
                    <div className={styles.cardMeta}>Reading client</div>
                  </div>
                </Card.Body>
              </Card>
              <div className={styles.linkList}>
                <a className={styles.linkRow} href="/help">
                  Help &amp; FAQ
                  <ChevronRightIcon size={16} className={styles.linkChevron} />
                </a>
                <a className={styles.linkRow} href="/help?tab=legal">
                  Terms of service
                  <ChevronRightIcon size={16} className={styles.linkChevron} />
                </a>
              </div>
              <p className={styles.guestNote}>Reading is available without an account. Sign-in and novel creation are handled by separate first-party services.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
