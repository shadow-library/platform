import { type ApiError } from '@/lib/apis';
import { type ReactElement, type ReactNode, useId } from 'react';

import {
  Alert,
  Badge,
  type BadgeIntent,
  Button,
  CopyIcon,
  copyText,
  EmptyState,
  IconButton,
  Input,
  MoonIcon,
  SearchIcon,
  Spinner,
  SunIcon,
  toast,
  useTheme,
} from '@shadow-library/ui';

import styles from './si.module.css';

export type ChipIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

/** The DS accent is indigo, and its `info` intent is also indigo — so an "accent" chip is an info Badge. */
const CHIP_INTENT: Record<ChipIntent, BadgeIntent> = { neutral: 'neutral', info: 'info', success: 'success', warning: 'warning', danger: 'danger', accent: 'info' };

interface StatusChipProps {
  intent?: ChipIntent;
  dot?: boolean;
  children: ReactNode;
}

export function StatusChip({ intent = 'neutral', dot = false, children }: StatusChipProps): ReactElement {
  return (
    <Badge intent={CHIP_INTENT[intent]} variant="soft" dot={dot}>
      {children}
    </Badge>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tags?: ReactNode;
  leading?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, tags, leading }: PageHeaderProps): ReactElement {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderIdentity}>
        {leading}
        <div className={styles.pageHeaderMain}>
          <div className={styles.pageHeaderTitleRow}>
            <h1 className={styles.pageTitle}>{title}</h1>
            {tags}
          </div>
          {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className={styles.pageHeaderActions}>{actions}</div>}
    </div>
  );
}

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({ title, description, action, children, className, bodyClassName }: SectionCardProps): ReactElement {
  return (
    <section className={`${styles.section}${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadMain}>
            {title && <h2 className={styles.sectionTitle}>{title}</h2>}
            {description && <p className={styles.sectionDesc}>{description}</p>}
          </div>
          {action && <div className={styles.sectionAction}>{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

interface EmptyAction {
  label: string;
  onClick: () => void;
}

interface QueryStateProps {
  isLoading: boolean;
  error: ApiError | null;
  isEmpty?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: EmptyAction;
  children: ReactElement;
}

export function QueryState({ isLoading, error, isEmpty, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, children }: QueryStateProps): ReactElement {
  if (isLoading)
    return (
      <div className={styles.queryLoading}>
        <Spinner size="lg" label="Loading" />
      </div>
    );
  if (error)
    return (
      <Alert intent="danger" title="Couldn’t reach the server" action={{ label: 'Retry', onClick: () => window.location.reload() }}>
        {error.message}
      </Alert>
    );
  if (isEmpty) return <EmptyState size="inline" title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return children;
}

/** `ThemeProvider` adopts the stored theme in a mount effect, so the icon settles after hydration instead of mismatching it. */
export function ThemeToggle(): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <IconButton
      variant="ghost"
      size="sm"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      icon={dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      onClick={toggleTheme}
    />
  );
}

interface CrumbTrailProps {
  root: string;
  leaf: string;
}

export function CrumbTrail({ root, leaf }: CrumbTrailProps): ReactElement {
  return (
    <span className={styles.crumbTrail} title={`${root} / ${leaf}`}>
      <span className={styles.crumbRoot}>{root} /</span> <span className={styles.crumbLeaf}>{leaf}</span>
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.mono}>{children}</span>;
}

interface CopyButtonProps {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = 'Copy' }: CopyButtonProps): ReactElement {
  return (
    <IconButton
      variant="ghost"
      size="sm"
      aria-label={label}
      icon={<CopyIcon size={15} />}
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) toast.success('Copied to clipboard');
        else toast.danger('Couldn’t copy');
      }}
    />
  );
}

interface GatedNoticeProps {
  subject: string;
  personal: boolean;
}

export function GatedNotice({ subject, personal }: GatedNoticeProps): ReactElement {
  return (
    <p className={styles.gatedNotice}>{personal ? `${subject} aren’t available to personal workspaces.` : `${subject} are managed by the organization’s owners and admins.`}</p>
  );
}

interface DangerZoneProps {
  title: string;
  description: ReactNode;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

export function DangerZone({ title, description, actionLabel, onAction, disabled }: DangerZoneProps): ReactElement {
  const titleId = useId();
  return (
    <section className={styles.dangerZone} aria-labelledby={titleId}>
      <div className={styles.dangerZoneMain}>
        <h2 id={titleId} className={styles.dangerZoneTitle}>
          {title}
        </h2>
        <p className={styles.dangerZoneDesc}>{description}</p>
      </div>
      <Button variant="danger" disabled={disabled} onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  );
}

interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  trailing?: ReactNode;
}

export function ListToolbar({ search, onSearchChange, searchLabel, searchPlaceholder, filters, trailing }: ListToolbarProps): ReactElement {
  return (
    <div className={styles.listToolbar} role="search">
      <div className={styles.listToolbarSearch}>
        <Input size="sm" placeholder={searchPlaceholder} aria-label={searchLabel} prefix={<SearchIcon size={15} />} value={search} onValueChange={onSearchChange} />
      </div>
      {filters}
      {trailing && <div className={styles.listToolbarTrailing}>{trailing}</div>}
    </div>
  );
}
