import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { Avatar, Button, Card, FormField, SegmentedControl, Select, Skeleton, Switch, type ThemeMode, TimePicker, toast, useTheme } from '@shadow-library/ui';
import { userDisplayName } from '@shadow-library/web';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { meQuery } from '@/lib/apis';
import {
  type BehaviourPreferences,
  type HeroIntensityMode,
  type SettledCommandResult,
  useAccountCommand,
  useAppSync,
  useBehaviourPreferences,
  useDayPreferences,
  useHeroCommand,
  useHeroDeck,
} from '@/lib/data';

import styles from './settings.module.css';

const CURRENCIES = [
  { value: 'EUR', label: 'EUR €' },
  { value: 'NOK', label: 'NOK kr' },
  { value: 'USD', label: 'USD $' },
  { value: 'GBP', label: 'GBP £' },
];

const TIMEZONES = ['Europe/Oslo', 'Europe/London', 'Europe/Lisbon', 'Europe/Berlin'];

const INTENSITIES: { value: HeroIntensityMode; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'standard', label: 'Standard' },
  { value: 'demanding', label: 'Demanding' },
];

const DEFERRED_HELP = 'Staged rather than applied — it takes effect at your next daily rollover, so the day in progress is never rewritten.';

const BEHAVIOUR_ROWS: { key: keyof BehaviourPreferences; label: string; help: string }[] = [
  { key: 'compactDensity', label: 'Compact density', help: 'Tighter rows on a desktop. Touch targets on a phone never shrink.' },
  { key: 'reduceMotion', label: 'Reduce motion', help: 'Removes experience fills and sheet transitions.' },
  { key: 'dailyJournalPrompt', label: 'Daily journal prompt', help: 'One question a day, dismissible, and never counted against you.' },
  { key: 'showCosmetics', label: 'Show coins and cosmetics', help: 'Hides the shop side of progression if you would rather not see it.' },
];

const DATA_ROWS: { id: string; label: string; help: string; action: string; to: string }[] = [
  { id: 'ai', label: 'Coaching consent', help: 'What the coach may read, per data class, each withdrawable on its own.', action: 'Manage', to: '/ai' },
  { id: 'export', label: 'Export your data', help: 'Everything you have logged, in formats you can open without this app.', action: 'Export', to: '/settings/export' },
  {
    id: 'notifications',
    label: 'Notification preferences',
    help: 'Email per category and push per device, all off until you turn them on.',
    action: 'Open',
    to: '/settings/notifications',
  },
  { id: 'delete', label: 'Delete your data', help: 'A thirty-day grace period, confirmed on your Shadow account.', action: 'Delete', to: '/settings/delete' },
];

export function SettingsScreen(): ReactElement {
  const me = useQuery(meQuery);
  const day = useDayPreferences();
  const behaviour = useBehaviourPreferences();
  const deck = useHeroDeck();
  const appSync = useAppSync();
  const command = useAccountCommand();
  const heroCommand = useHeroCommand();
  const { mode, setMode } = useTheme();

  const notify = (result: SettledCommandResult): void => {
    if (result.message.length > 0) toast.neutral(result.message);
  };

  const earnedTitles = (deck.data?.titles ?? []).filter(title => title.earnedOn !== null);

  return (
    <Screen title="Settings" subtitle="Your day, your money, how the app behaves, and every right you have over what it holds.">
      <ScreenColumns
        aside={
          <>
            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>Jump to</h2>
              <nav className={styles.jump}>
                <Link to="/settings/notifications" className={styles.jumpItem}>
                  <span>Notifications</span>
                  <span className={styles.jumpMeta}>all off by default</span>
                </Link>
                <Link to="/settings/billing" className={styles.jumpItem}>
                  <span>Plan and billing</span>
                </Link>
                <Link to="/settings/export" className={styles.jumpItem}>
                  <span>Data export</span>
                  <span className={styles.jumpMeta}>everything you have logged</span>
                </Link>
                <Link to="/settings/app" className={styles.jumpItem}>
                  <span>App and sync</span>
                  <span className={styles.jumpMeta}>{appSync.data ? `${appSync.data.queuedCount} queued` : ''}</span>
                </Link>
                <Link to="/settings/delete" className={styles.jumpItem}>
                  <span>Delete your data</span>
                </Link>
              </nav>
            </Card>

            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>App</h2>
              <ul className={screenStyles.list}>
                <li>{appSync.data ? appSync.data.title.toLowerCase() : 'Checking this device'}</li>
                <li>{appSync.data ? `${appSync.data.devices.length} device${appSync.data.devices.length === 1 ? '' : 's'} registered` : 'Checking this device'}</li>
                <li>Everything below works with no connection</li>
              </ul>
              <div className={styles.actions}>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/settings/app">App and sync</Link>
                </Button>
              </div>
            </Card>
          </>
        }
      >
        <Card padding="lg">
          <h2 className={styles.sectionTitle}>Profile in Shadow Memoir</h2>
          <div className={styles.identity}>
            <Avatar name={userDisplayName(me.data)} size="lg" />
            <div>
              <div className={styles.identityName}>{userDisplayName(me.data)}</div>
              <p className={styles.identityMeta}>Signed in through the platform · account details are managed there</p>
            </div>
          </div>
          <p className={styles.sectionNote}>
            Your name, email and picture come from your Shadow account and are managed there. Nothing on this screen changes them, and Shadow Memoir stores only a copy for display.
          </p>
          <FormField label="Displayed title" helper="Titles are earned rather than chosen. This picks which earned one is shown.">
            <Select
              value={deck.data?.displayedTitleId ?? 'none'}
              aria-label="Displayed title"
              disabled={earnedTitles.length === 0}
              onValueChange={value => heroCommand.mutate({ type: 'title.display', titleId: value === 'none' ? null : value }, { onSuccess: notify })}
            >
              {earnedTitles.map(title => (
                <Select.Item key={title.id} value={title.id}>
                  {title.name}
                </Select.Item>
              ))}
              <Select.Item value="none">No title</Select.Item>
            </Select>
          </FormField>
        </Card>

        <Card padding="lg">
          <h2 className={styles.sectionTitle}>Day and money</h2>
          <p className={styles.sectionNote}>Your wake window decides when a day starts and ends for quests, rather than midnight.</p>
          {day.isPending || !day.data ? (
            <Skeleton.List rows={4} />
          ) : (
            <div className={styles.fields}>
              <FormField label="Wake time">
                <TimePicker
                  defaultValue={day.data.wakeTime}
                  onValueChange={value => command.mutate({ type: 'day.set', patch: { wakeTime: value ?? '' } }, { onSuccess: notify })}
                />
              </FormField>
              <FormField label="Sleep time">
                <TimePicker
                  defaultValue={day.data.sleepTime}
                  onValueChange={value => command.mutate({ type: 'day.set', patch: { sleepTime: value ?? '' } }, { onSuccess: notify })}
                />
              </FormField>
              <FormField
                label="Timezone"
                helper={day.data.pendingTimezone ? `${day.data.pendingTimezone} is waiting. ${DEFERRED_HELP}` : 'Travel does not shift your day unless you change it here.'}
              >
                <Select
                  value={day.data.pendingTimezone ?? day.data.timezone}
                  aria-label="Timezone"
                  onValueChange={value => command.mutate({ type: 'day.set', patch: { timezone: value } }, { onSuccess: notify })}
                >
                  {TIMEZONES.map(zone => (
                    <Select.Item key={zone} value={zone}>
                      {zone}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Intensity"
                helper={day.data.pendingIntensity ? `A change is waiting. ${DEFERRED_HELP}` : 'How much a missed day costs. Lowering it is never punished.'}
              >
                <Select
                  value={day.data.pendingIntensity ?? day.data.intensity}
                  aria-label="Intensity"
                  onValueChange={value => command.mutate({ type: 'day.set', patch: { intensity: value as HeroIntensityMode } }, { onSuccess: notify })}
                >
                  {INTENSITIES.map(option => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
              <FormField
                label="Home currency"
                helper={
                  day.data.currencyLocked
                    ? 'Fixed when you set up, so the totals in your history stay comparable. Spend in another currency keeps its own and converts to this one.'
                    : 'Foreign spend keeps its original currency and converts to this one.'
                }
                disabled={day.data.currencyLocked}
              >
                <Select value={day.data.currency} aria-label="Home currency" disabled={day.data.currencyLocked}>
                  {CURRENCIES.map(currency => (
                    <Select.Item key={currency.value} value={currency.value}>
                      {currency.label}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h2 className={styles.sectionTitle}>Appearance and behaviour</h2>
          <div className={styles.settingRows}>
            <SettingRow
              label="Theme"
              help="Follows your system unless you choose."
              control={
                <SegmentedControl value={mode} onValueChange={value => setMode(value as ThemeMode)}>
                  <SegmentedControl.Item value="light">Light</SegmentedControl.Item>
                  <SegmentedControl.Item value="dark">Dark</SegmentedControl.Item>
                  <SegmentedControl.Item value="system">System</SegmentedControl.Item>
                </SegmentedControl>
              }
            />
            {BEHAVIOUR_ROWS.map(row => (
              <SettingRow
                key={row.key}
                label={row.label}
                help={row.help}
                control={
                  <Switch
                    checked={behaviour.data?.[row.key] ?? false}
                    aria-label={row.label}
                    onCheckedChange={checked => command.mutate({ type: 'behaviour.set', patch: { [row.key]: checked } }, { onSuccess: notify })}
                  />
                }
              />
            ))}
          </div>
        </Card>

        <Card padding="lg">
          <h2 className={styles.sectionTitle}>Data and privacy</h2>
          <p className={styles.sectionNote}>Your log is private by default. Nothing is shared, published or compared with anyone.</p>
          <div className={styles.settingRows}>
            {DATA_ROWS.map(row => (
              <SettingRow
                key={row.id}
                label={row.label}
                help={row.help}
                control={
                  <Button size="sm" variant="secondary" asChild>
                    <Link to={row.to}>{row.action}</Link>
                  </Button>
                }
              />
            ))}
          </div>
        </Card>
      </ScreenColumns>
    </Screen>
  );
}

function SettingRow({ label, help, control }: { label: string; help: string; control: ReactNode }): ReactElement {
  return (
    <div className={styles.settingRow}>
      <div>
        <div className={styles.settingLabel}>{label}</div>
        <p className={styles.settingHelp}>{help}</p>
      </div>
      <div className={styles.settingControl}>{control}</div>
    </div>
  );
}
