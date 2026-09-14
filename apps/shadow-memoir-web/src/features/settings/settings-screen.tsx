import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type FocusEvent, type KeyboardEvent, type ReactElement, type ReactNode, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Card, FormField, Input, SegmentedControl, Select, Skeleton, type ThemeMode, TimePicker, useTheme } from '@shadow-library/ui';
import { userDisplayName } from '@shadow-library/web';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { meQuery } from '@/lib/apis';
import {
  type AccountCommandHook,
  CURRENCIES,
  type DayPreferences,
  DELETION_TERMS,
  type ExportJob,
  type HeroIntensityMode,
  isCurrencyCode,
  minorToMajor,
  notifyOutcome,
  parseAmountToMinor,
  SYNC_COPY,
  useAccountCommand,
  useAppSync,
  useDayPreferences,
  useExportView,
  useHeroCommand,
  useHeroDeck,
  useNotificationSettings,
} from '@/lib/data';
import { timeZoneOptions } from '@/lib/format';
import { type NetState, type SyncReadiness, useSyncStatus } from '@/lib/sync';

import styles from './settings.module.css';

const INTENSITIES: { value: HeroIntensityMode; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'standard', label: 'Standard' },
  { value: 'demanding', label: 'Demanding' },
];

const SLEEP_BEFORE_WAKE = 'Sleep time must be later than wake time.';

const DAY_AND_MONEY_FIELD_COUNT = 6;

const DATA_ROWS: { id: string; label: string; help: string; action: string; to: string }[] = [
  { id: 'ai', label: 'Coaching consent', help: 'What the coach may read, per data class, each withdrawable on its own.', action: 'Manage', to: '/ai' },
  { id: 'export', label: 'Export your data', help: 'Everything you have logged, in formats you can open without this app.', action: 'Export', to: '/settings/export' },
  {
    id: 'notifications',
    label: 'Notification preferences',
    help: 'Email per category. Push is coming soon.',
    action: 'Open',
    to: '/settings/notifications',
  },
  { id: 'delete', label: 'Delete your data', help: DELETION_TERMS, action: 'Delete', to: '/settings/delete' },
];

function notificationsMeta(onCount: number, total: number): string {
  return onCount === 0 ? 'all off' : `${onCount} of ${total} on`;
}

function exportMeta(job: ExportJob): string {
  switch (job.stage) {
    case 'idle':
      return 'not started';
    case 'preparing':
      return 'preparing…';
    case 'ready':
      return 'ready to download';
    case 'failed':
      return 'failed — try again';
  }
}

function intensityLabel(value: HeroIntensityMode): string {
  return INTENSITIES.find(option => option.value === value)?.label ?? value;
}

function pendingHelp(pendingLabel: string, activeLabel: string): string {
  return `${pendingLabel} from your next rollover — ${activeLabel} stays active today.`;
}

function appStatusLine(readiness: SyncReadiness, state: NetState): string {
  if (readiness.kind === 'loading') return 'Checking this device';
  if (readiness.kind === 'failed' && readiness.reason === 'deletion-pending') return 'This account is being deleted';
  return SYNC_COPY[state].title;
}

export function SettingsScreen(): ReactElement {
  const me = useQuery(meQuery);
  const day = useDayPreferences();
  const deck = useHeroDeck();
  const appSync = useAppSync();
  const notifications = useNotificationSettings();
  const emailPreferences = notifications.data?.preferences;
  const emailMeta = emailPreferences ? notificationsMeta(emailPreferences.filter(preference => preference.email).length, emailPreferences.length) : null;
  const exportView = useExportView();
  const command = useAccountCommand();
  const heroCommand = useHeroCommand();
  const syncStatus = useSyncStatus();
  const { mode, setMode } = useTheme();

  const selectTitle = async (titleId: string): Promise<void> => {
    const outcome = await heroCommand.run({ type: 'title.display', titleId: titleId === 'none' ? null : titleId });
    notifyOutcome(outcome, outcome.status === 'applied' ? { success: outcome.local.message, action: 'save' } : { success: '', action: 'save' });
  };

  return (
    <Screen title="Settings" subtitle="Your day, your money, how the app behaves, and every right you have over what it holds.">
      <ScreenColumns
        aside={
          <>
            <Card padding="md">
              <Card.Body>
                <h2 className={screenStyles.cardTitle}>Jump to</h2>
                <nav className={styles.jump}>
                  <Link to="/settings/notifications" className={styles.jumpItem}>
                    <span>Notifications</span>
                    <span className={styles.jumpMeta}>{emailMeta ?? ''}</span>
                  </Link>
                  <Link to="/settings/billing" className={styles.jumpItem}>
                    <span>Plan and billing</span>
                  </Link>
                  <Link to="/settings/export" className={styles.jumpItem}>
                    <span>Data export</span>
                    <span className={styles.jumpMeta}>{exportView.data ? exportMeta(exportView.data.job) : ''}</span>
                  </Link>
                  <Link to="/settings/app" className={styles.jumpItem}>
                    <span>App and sync</span>
                    <span className={styles.jumpMeta}>{appSync.data ? `${appSync.data.queuedCount} queued` : ''}</span>
                  </Link>
                  <Link to="/settings/delete" className={styles.jumpItem}>
                    <span>Delete your data</span>
                  </Link>
                </nav>
              </Card.Body>
            </Card>

            <Card padding="md">
              <Card.Body>
                <h2 className={screenStyles.cardTitle}>App</h2>
                <ul className={screenStyles.list}>
                  <li>{appStatusLine(syncStatus.readiness, syncStatus.state)}</li>
                  <li>{appSync.data ? `${appSync.data.devices.length} device${appSync.data.devices.length === 1 ? '' : 's'} registered` : 'Checking this device'}</li>
                </ul>
                <div className={styles.actions}>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/settings/app">App and sync</Link>
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </>
        }
      >
        <Card padding="lg">
          <Card.Body>
            <h2 className={styles.sectionTitle}>Profile in Shadow Memoir</h2>
            <div className={styles.identity}>
              <Avatar name={userDisplayName(me.data)} size="lg" />
              <div>
                <div className={styles.identityName}>{userDisplayName(me.data)}</div>
                <p className={styles.identityMeta}>
                  {me.isError
                    ? 'Profile unavailable — your Shadow account could not be reached, so a placeholder is shown here.'
                    : me.data?.email
                      ? `${me.data.email} · Signed in through the platform`
                      : 'Signed in through the platform · account details are managed there'}
                </p>
              </div>
            </div>
            <p className={styles.sectionNote}>
              Your name, email and picture come from your Shadow account and are managed there. Nothing on this screen changes them, and Shadow Memoir stores only a copy for
              display.
            </p>
            <DataState
              query={deck}
              size="inline"
              skeleton={
                <div className={styles.fieldSkeleton}>
                  <Skeleton shape="line" width="35%" />
                  <Skeleton shape="rect" width="100%" height={42} />
                </div>
              }
            >
              {data => {
                const earnedTitles = data.titles.filter(title => title.earnedOn !== null);
                const pending = heroCommand.isPendingFor(item => item.type === 'title.display');
                return (
                  <FormField label="Displayed title" helper="Titles are earned rather than chosen. This picks which earned one is shown.">
                    <Select
                      value={data.displayedTitleId ?? 'none'}
                      aria-label="Displayed title"
                      disabled={earnedTitles.length === 0}
                      loading={pending}
                      onValueChange={value => {
                        if (pending) return;
                        void selectTitle(value);
                      }}
                    >
                      {earnedTitles.map(title => (
                        <Select.Item key={title.id} value={title.id}>
                          {title.name}
                        </Select.Item>
                      ))}
                      <Select.Item value="none">No title</Select.Item>
                    </Select>
                  </FormField>
                );
              }}
            </DataState>
          </Card.Body>
        </Card>

        <Card padding="lg" id="day-and-money">
          <Card.Body>
            <h2 className={styles.sectionTitle}>Day and money</h2>
            <p className={styles.sectionNote}>Your wake window decides when a day starts and ends for quests, rather than midnight.</p>
            <DataState query={day} source="server" size="inline" skeleton={<DayAndMoneySkeleton />}>
              {data => <DayAndMoneyFields day={data} command={command} />}
            </DataState>
          </Card.Body>
        </Card>

        <Card padding="lg">
          <Card.Body>
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
            </div>
          </Card.Body>
        </Card>

        <Card padding="lg">
          <Card.Body>
            <h2 className={styles.sectionTitle}>Data and privacy</h2>
            <p className={styles.sectionNote}>Your log is private by default. Nothing is shared, published or compared with anyone.</p>
            <div className={styles.settingRows}>
              {DATA_ROWS.map(row => (
                <SettingRow
                  key={row.id}
                  label={row.label}
                  help={row.id === 'notifications' && emailMeta ? `Email per category, ${emailMeta} right now. Push is coming soon.` : row.help}
                  control={
                    <Button size="sm" variant="secondary" asChild>
                      <Link to={row.to}>{row.action}</Link>
                    </Button>
                  }
                />
              ))}
            </div>
          </Card.Body>
        </Card>
      </ScreenColumns>
    </Screen>
  );
}

function SettingRow({ label, help, control }: { label: string; help: string; control: ReactNode }): ReactElement {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingRowText}>
        <div className={styles.settingLabel}>{label}</div>
        <p className={styles.settingHelp}>{help}</p>
      </div>
      <div className={styles.settingControl}>{control}</div>
    </div>
  );
}

function DayAndMoneySkeleton(): ReactElement {
  return (
    <div className={styles.fields}>
      {Array.from({ length: DAY_AND_MONEY_FIELD_COUNT }, (_, index) => (
        <div key={index} className={styles.fieldSkeleton}>
          <Skeleton shape="line" width="35%" />
          <Skeleton shape="rect" width="100%" height={42} />
        </div>
      ))}
    </div>
  );
}

interface TimeState {
  wakeTime: string;
  sleepTime: string;
}

interface DayAndMoneyFieldsProps {
  day: DayPreferences;
  command: AccountCommandHook;
}

function DayAndMoneyFields({ day, command }: DayAndMoneyFieldsProps): ReactElement {
  const currency = isCurrencyCode(day.currency) ? day.currency : null;
  const budgetSeed = currency && day.monthlyBudgetMinor !== null ? minorToMajor(day.monthlyBudgetMinor, currency).toFixed(CURRENCIES[currency].exponent) : '';
  const zoneOptions = useMemo(() => timeZoneOptions(day.timezone, day.pendingTimezone), [day.timezone, day.pendingTimezone]);

  const [times, setTimes] = useState<TimeState>({ wakeTime: day.wakeTime, sleepTime: day.sleepTime });
  const [syncedTimes, setSyncedTimes] = useState<TimeState>(times);
  const [timeErrors, setTimeErrors] = useState<Partial<TimeState>>({});
  const [resetTokens, setResetTokens] = useState({ wakeTime: 0, sleepTime: 0 });
  const [budgetText, setBudgetText] = useState(budgetSeed);
  const [syncedBudgetSeed, setSyncedBudgetSeed] = useState(budgetSeed);
  const [budgetError, setBudgetError] = useState<string | undefined>();

  if (syncedTimes.wakeTime !== day.wakeTime || syncedTimes.sleepTime !== day.sleepTime) {
    setSyncedTimes({ wakeTime: day.wakeTime, sleepTime: day.sleepTime });
    setTimes({ wakeTime: day.wakeTime, sleepTime: day.sleepTime });
  }

  if (syncedBudgetSeed !== budgetSeed) {
    setSyncedBudgetSeed(budgetSeed);
    setBudgetText(budgetSeed);
  }

  const revertTime = (field: keyof TimeState, value: string): void => {
    setTimes(current => ({ ...current, [field]: value }));
    setResetTokens(current => ({ ...current, [field]: current[field] + 1 }));
  };

  const handleTimeChange = async (field: keyof TimeState, value: string | null): Promise<void> => {
    if (value === null) return;
    const previous = times[field];
    const next = { ...times, [field]: value };
    if (next.sleepTime <= next.wakeTime) {
      setTimeErrors(current => ({ ...current, [field]: SLEEP_BEFORE_WAKE }));
      revertTime(field, previous);
      return;
    }

    setTimeErrors(current => ({ ...current, wakeTime: undefined, sleepTime: undefined }));
    setTimes(next);
    const outcome = await command.run({ type: 'day.set', patch: { [field]: value } });
    if (outcome.status === 'applied') return notifyOutcome(outcome, { success: outcome.local.message, action: 'save' });

    revertTime(field, previous);
    if (outcome.status === 'rejected') return setTimeErrors(current => ({ ...current, [field]: outcome.message }));
    notifyOutcome(outcome, { success: '', action: 'save' });
  };

  const handleDaySelect = async (patch: Partial<Pick<DayPreferences, 'timezone' | 'intensity'>>): Promise<void> => {
    const outcome = await command.run({ type: 'day.set', patch });
    notifyOutcome(outcome, outcome.status === 'applied' ? { success: outcome.local.message, action: 'save' } : { success: '', action: 'save' });
  };

  const commitBudget = async (): Promise<void> => {
    if (!currency) return;
    const trimmed = budgetText.trim();
    if (trimmed === '') {
      if (day.monthlyBudgetMinor !== null) await clearBudget();
      return;
    }

    const parsed = parseAmountToMinor(trimmed, currency);
    if (parsed === null) {
      setBudgetError('Enter an amount of zero or more, for example 1500.');
      return;
    }
    if (parsed === day.monthlyBudgetMinor) return;

    setBudgetError(undefined);
    const outcome = await command.run({ type: 'day.set', patch: { monthlyBudgetMinor: parsed } });
    if (outcome.status === 'applied') return notifyOutcome(outcome, { success: outcome.local.message, action: 'save', subject: 'monthly budget' });

    setBudgetText(budgetSeed);
    if (outcome.status === 'rejected') return setBudgetError(outcome.message);
    notifyOutcome(outcome, { success: '', action: 'save', subject: 'monthly budget' });
  };

  const clearBudget = async (): Promise<void> => {
    if (!currency) return;
    setBudgetError(undefined);
    if (day.monthlyBudgetMinor === null) return setBudgetText('');

    const outcome = await command.run({ type: 'day.set', patch: { monthlyBudgetMinor: null } });
    if (outcome.status === 'applied') {
      setBudgetText('');
      return notifyOutcome(outcome, { success: outcome.local.message, action: 'save', subject: 'monthly budget' });
    }
    if (outcome.status === 'rejected') return setBudgetError(outcome.message);
    notifyOutcome(outcome, { success: '', action: 'save', subject: 'monthly budget' });
  };

  const budgetPending = command.isPendingFor(item => item.type === 'day.set' && 'monthlyBudgetMinor' in item.patch);
  const budgetDirty = !budgetPending && budgetText !== budgetSeed;

  return (
    <div className={styles.fields}>
      <FormField label="Wake time" error={timeErrors.wakeTime}>
        <TimePicker key={resetTokens.wakeTime} value={times.wakeTime} hour12={false} onValueChange={value => void handleTimeChange('wakeTime', value)} />
      </FormField>
      <FormField label="Sleep time" error={timeErrors.sleepTime}>
        <TimePicker key={resetTokens.sleepTime} value={times.sleepTime} hour12={false} onValueChange={value => void handleTimeChange('sleepTime', value)} />
      </FormField>
      <FormField label="Timezone" helper={day.pendingTimezone ? pendingHelp(day.pendingTimezone, day.timezone) : 'Travel does not shift your day unless you change it here.'}>
        <Select value={day.pendingTimezone ?? day.timezone} aria-label="Timezone" onValueChange={value => void handleDaySelect({ timezone: value })}>
          {zoneOptions.map(zone => (
            <Select.Item key={zone.value} value={zone.value}>
              {zone.label}
            </Select.Item>
          ))}
        </Select>
      </FormField>
      <FormField
        label="Intensity"
        helper={
          day.pendingIntensity ? pendingHelp(intensityLabel(day.pendingIntensity), intensityLabel(day.intensity)) : 'How much a missed day costs. Lowering it is never punished.'
        }
      >
        <Select value={day.pendingIntensity ?? day.intensity} aria-label="Intensity" onValueChange={value => void handleDaySelect({ intensity: value as HeroIntensityMode })}>
          {INTENSITIES.map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
      </FormField>
      <FormField
        label="Home currency"
        helper="Fixed when you set up, so the totals in your history stay comparable. Spend in another currency keeps its own and converts to this one."
      >
        <Input size="md" aria-label="Home currency" readOnly value={currency ? `${day.currency} · ${CURRENCIES[currency].label}` : day.currency} />
      </FormField>
      <FormField
        label="Monthly budget"
        error={budgetError}
        helper={
          budgetDirty
            ? 'Unsaved — press Enter to save.'
            : currency
              ? 'A soft ceiling for the calendar month — nothing here is blocked when you go over it.'
              : `Monthly budget isn't available for ${day.currency} yet.`
        }
      >
        <BudgetControl
          value={budgetText}
          disabled={!currency}
          pending={budgetPending}
          prefix={currency ? CURRENCIES[currency].symbol : day.currency}
          clearDisabled={!currency || (day.monthlyBudgetMinor === null && budgetText === '')}
          onValueChange={value => {
            setBudgetText(value);
            setBudgetError(undefined);
          }}
          onBlur={() => void commitBudget()}
          onEnter={() => void commitBudget()}
          onClear={() => void clearBudget()}
        />
      </FormField>
    </div>
  );
}

interface BudgetControlProps {
  value: string;
  disabled: boolean;
  pending: boolean;
  prefix: string;
  clearDisabled: boolean;
  onValueChange: (value: string) => void;
  onBlur: () => void;
  onEnter: () => void;
  onClear: () => void;
  id?: string;
  invalid?: boolean;
  'aria-describedby'?: string;
}

function BudgetControl({
  value,
  disabled,
  pending,
  prefix,
  clearDisabled,
  onValueChange,
  onBlur,
  onEnter,
  onClear,
  id,
  invalid,
  'aria-describedby': describedBy,
}: BudgetControlProps): ReactElement {
  const clearRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onEnter();
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    if (event.relatedTarget === clearRef.current) return;
    onBlur();
  };

  return (
    <div className={styles.budgetRow}>
      <Input
        id={id}
        size="md"
        inputMode="decimal"
        autoComplete="off"
        aria-label="Monthly budget"
        aria-describedby={describedBy}
        prefix={prefix}
        value={value}
        disabled={disabled}
        readOnly={pending}
        invalid={invalid}
        onValueChange={onValueChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      <Button ref={clearRef} type="button" size="sm" variant="ghost" disabled={pending || clearDisabled} onMouseDown={event => event.preventDefault()} onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
