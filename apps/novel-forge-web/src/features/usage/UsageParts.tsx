import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Tooltip } from '@shadow-library/ui';

import { type BreakdownRow, type ChargeRowItem, formatUsd, type UsageBarItem } from '@/lib/usage';

import styles from './usage.module.css';

interface StatGridProps {
  columns?: 3 | 4;
  children: ReactNode;
}

export function StatGrid({ columns = 3, children }: StatGridProps): ReactElement {
  return (
    <div className={styles.statGrid} data-columns={columns}>
      {children}
    </div>
  );
}

interface StatCardProps {
  label: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function StatCard({ label, children, footer }: StatCardProps): ReactElement {
  return (
    <div className={styles.statCard}>
      <div className={styles.statCardLabel}>{label}</div>
      {children}
      {footer && <div className={styles.statCardFooter}>{footer}</div>}
    </div>
  );
}

interface StatValueProps {
  value: ReactNode;
  unit?: ReactNode;
}

export function StatValue({ value, unit }: StatValueProps): ReactElement {
  return (
    <div className={styles.statBig}>
      <span className={styles.statNum}>{value}</span>
      {unit && <span className={styles.statUnit}>{unit}</span>}
    </div>
  );
}

interface StatNoteProps {
  children: ReactNode;
}

export function StatNote({ children }: StatNoteProps): ReactElement {
  return <span className={styles.statNote}>{children}</span>;
}

interface UsageBarsProps {
  label: string;
  items: readonly UsageBarItem[];
}

export function UsageBars({ label, items }: UsageBarsProps): ReactElement {
  return (
    <>
      <div className={styles.bars} aria-hidden="true">
        {items.map(item => (
          <Tooltip key={item.key} content={item.tip}>
            <div className={styles.barCol}>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ '--pct': `${item.pct}%` } as CSSProperties} />
              </div>
              <span className={styles.barLabel}>{item.label}</span>
            </div>
          </Tooltip>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {items.map(item => (
            <tr key={item.key}>
              <td>{item.tip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

interface BreakdownTableProps {
  heading: string;
  rows: readonly BreakdownRow[];
  showTokens?: boolean;
  flush?: boolean;
}

export function BreakdownTable({ heading, rows, showTokens = false, flush = false }: BreakdownTableProps): ReactElement {
  return (
    <table className={styles.costTable} data-flush={flush || undefined}>
      <thead>
        <tr>
          <th scope="col">{heading}</th>
          <th scope="col">Calls</th>
          {showTokens && <th scope="col">Tokens in / out</th>}
          <th scope="col">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key}>
            <td>{row.label}</td>
            <td>{row.calls.toLocaleString()}</td>
            {showTokens && <td>{row.tokens}</td>}
            <td>
              {formatUsd(row.costUsd)}
              {(row.estimatedCostUsd ?? 0) > 0 && <EstimateMark />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EstimateMark(): ReactElement {
  return (
    <>
      <span className={styles.estimateMark} aria-hidden="true">
        *
      </span>
      <span className="sr-only"> (includes an estimate)</span>
    </>
  );
}

interface ChargeRowsProps {
  label: string;
  items: readonly ChargeRowItem[];
}

export function ChargeRows({ label, items }: ChargeRowsProps): ReactElement {
  return (
    <ul className={styles.chargeRows} aria-label={label}>
      {items.map(item => (
        <li key={item.key} className={styles.chargeRow}>
          <span className={styles.chargeLabel}>{item.label}</span>
          <span className={styles.chargeTrack} aria-hidden="true">
            <span className={styles.chargeFill} style={{ width: `${item.pct}%` }} />
          </span>
          <span className={styles.chargeAmount}>
            {item.amount}
            {item.estimated && <EstimateMark />}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface EstimateNoteProps {
  estimatedCostUsd: number;
}

export function EstimateNote({ estimatedCostUsd }: EstimateNoteProps): ReactElement | null {
  if (estimatedCostUsd <= 0) return null;
  return (
    <p className={styles.estimateNote}>
      <span className={styles.estimateMark}>*</span> Includes {formatUsd(estimatedCostUsd)} estimated from list prices for calls that recorded no cost.
    </p>
  );
}

interface UsageEmptyProps {
  chart?: boolean;
  children: ReactNode;
}

export function UsageEmpty({ chart = false, children }: UsageEmptyProps): ReactElement {
  return (
    <p className={styles.empty} data-chart={chart || undefined}>
      {children}
    </p>
  );
}

interface UsageGridProps {
  children: ReactNode;
}

export function UsageGrid({ children }: UsageGridProps): ReactElement {
  return <div className={styles.usageGrid}>{children}</div>;
}

interface UsageSplitProps {
  title: string;
  children: ReactNode;
}

export function UsageSplit({ title, children }: UsageSplitProps): ReactElement {
  return (
    <div className={styles.split}>
      <h4 className={styles.splitTitle}>{title}</h4>
      {children}
    </div>
  );
}

interface CardNoteProps {
  children: ReactNode;
}

export function CardNote({ children }: CardNoteProps): ReactElement {
  return <span className={styles.cardNote}>{children}</span>;
}
