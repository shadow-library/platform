import { type CSSProperties, type FocusEvent, forwardRef, type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react';

import { cn, DEFAULT_LOCALE } from '@/lib';

import { EmptyState } from '../EmptyState';
import { Popover } from '../Popover';
import styles from './Chart.module.css';
import { areaPath, columnTotal, domainMax, labelBox, linePath, niceTicks, planLabels, readValue, resolveSlots, stackColumn } from './Chart.scale';
import { type ChartDatum, type ChartProps, type ChartSeries, type ChartType } from './Chart.types';

const DEFAULT_HEIGHT = 240;
const PX_PER_TICK_INTERVAL = 60;
const BAND_AIR = 0.15;
const VALUE_FORMAT = new Intl.NumberFormat(DEFAULT_LOCALE, { maximumFractionDigits: 2 });
const TICK_FORMAT = new Intl.NumberFormat(DEFAULT_LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

const formatDefaultValue = (value: number): string => VALUE_FORMAT.format(value);
const formatDefaultTick = (value: number): string => TICK_FORMAT.format(value);
const formatIdentity = (x: string): string => x;

interface PlottedSeries extends Omit<ChartSeries, 'slot'> {
  slot: string;
}

function assignSlots(series: readonly ChartSeries[]): PlottedSeries[] {
  const slots = resolveSlots(series);
  return series.map((entry, i) => ({ ...entry, slot: slots[i] ?? 'neutral' }));
}

function bandStyle(index: number, count: number): CSSProperties {
  return { left: `${(index / count) * 100}%`, width: `${100 / count}%` };
}

function centerOf(index: number, count: number): string {
  return `${((index + 0.5) / count) * 100}%`;
}

function nextIndex(key: string, current: number, count: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(count - 1, current + 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

function swatchShape(type: ChartType): 'line' | 'rect' {
  return type === 'line' ? 'line' : 'rect';
}

/** SSR-safe: renders identical markup on server and client at any width, with no measuring. */
export const Chart = forwardRef<HTMLDivElement, ChartProps>(function Chart(
  {
    type,
    data,
    series,
    stacked = false,
    formatValue,
    formatTick,
    formatX = formatIdentity,
    height = DEFAULT_HEIGHT,
    'aria-label': ariaLabel,
    emptyState,
    legend = true,
    className,
    ...props
  },
  ref,
) {
  const [active, setActive] = useState<number | null>(null);
  const [tabStop, setTabStop] = useState(0);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  const count = data.length;
  const stacks = stacked && type !== 'line';
  const plotted = useMemo(() => assignSlots(series), [series]);
  const { top, ticks } = useMemo(() => niceTicks(domainMax(data, series, stacks), Math.max(2, Math.round(height / PX_PER_TICK_INTERVAL))), [data, series, stacks, height]);
  const xLabels = useMemo(() => data.map(datum => formatX(datum.x)), [data, formatX]);
  const labelPlan = useMemo(() => planLabels(xLabels), [xLabels]);

  if (count === 0 || series.length === 0) {
    return (
      <div ref={ref} className={cn(styles.root, className)} {...props}>
        <div className={styles.empty} style={{ minHeight: height }}>
          {emptyState ?? <EmptyState size="inline" title="No data" />}
        </div>
      </div>
    );
  }

  const formatCell = formatValue ?? formatDefaultValue;
  const tickLabel = formatTick ?? formatDefaultTick;
  const showTotal = series.length > 1;
  const activeIndex = active !== null && active < count ? active : null;
  const rovingIndex = Math.min(tabStop, count - 1);
  const level = (value: number): number => (Math.max(0, value) / top) * 100;
  const dotIndex = activeIndex ?? (count === 1 ? 0 : null);

  const summary = (datum: ChartDatum, index: number): string => {
    const parts = series.map(entry => `${entry.label} ${formatCell(readValue(datum, entry.key))}`);
    if (showTotal) parts.push(`Total ${formatCell(columnTotal(datum, series))}`);
    return `${xLabels[index]}: ${parts.join(', ')}`;
  };

  const focusColumn = (index: number): void => columnRefs.current[index]?.focus();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = nextIndex(event.key, rovingIndex, count);
    if (target === null) return;
    event.preventDefault();
    focusColumn(target);
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>): void => {
    setActive(event.currentTarget.contains(document.activeElement) ? rovingIndex : null);
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(null);
  };

  const bars = data.map((datum, index) => {
    const band = { ...bandStyle(index, count), paddingInline: `max(1px, ${(BAND_AIR * 100) / count}%)` };
    if (stacks) {
      const segments = stackColumn(datum, series);
      const total = segments.at(-1)?.end ?? 0;
      return (
        <div key={index} className={styles.band} style={band}>
          <div className={styles.stack} style={{ height: `${level(total)}%` }}>
            {segments.map((segment, i) =>
              segment.end > segment.start ? (
                <div key={i} className={cn(styles.series, styles.segment)} data-slot={plotted[i]?.slot} style={{ height: `${((segment.end - segment.start) / total) * 100}%` }} />
              ) : null,
            )}
          </div>
        </div>
      );
    }
    return (
      <div key={index} className={styles.band} style={band}>
        {plotted.map((entry, i) => (
          <div key={i} className={cn(styles.series, styles.bar)} data-slot={entry.slot} style={{ height: `${level(readValue(datum, entry.key))}%` }} />
        ))}
      </div>
    );
  });

  const geometry = (type === 'bar' ? [] : plotted).map((entry, i) => {
    const segments = data.map(datum => (stacks ? stackColumn(datum, series)[i] : undefined) ?? { start: 0, end: readValue(datum, entry.key) });
    return { upper: segments.map(segment => level(segment.end)), lower: segments.map(segment => level(segment.start)) };
  });
  const lines = (
    <svg className={styles.svg} viewBox={`0 0 ${count} 100`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {type === 'area'
        ? plotted.map((entry, i) => (
            <path
              key={`area-${i}`}
              className={cn(styles.series, styles.area)}
              data-slot={entry.slot}
              data-stacked={stacks || undefined}
              d={areaPath(geometry[i]?.upper ?? [], geometry[i]?.lower ?? [])}
            />
          ))
        : null}
      {plotted.map((entry, i) => (
        <path key={`line-${i}`} className={cn(styles.series, styles.line)} data-slot={entry.slot} vectorEffect="non-scaling-stroke" d={linePath(geometry[i]?.upper ?? [])} />
      ))}
    </svg>
  );

  const activeDatum = activeIndex === null ? undefined : data[activeIndex];
  const activeLabel = activeDatum === undefined ? '' : formatX(activeDatum.x);

  return (
    <div ref={ref} className={cn(styles.root, className)} {...props}>
      <div className={styles.frame}>
        <div className={styles.yAxis} aria-hidden="true">
          {ticks.map(tick => (
            <span key={tick} className={styles.yTick} style={{ bottom: `${level(tick)}%` }}>
              {tickLabel(tick)}
            </span>
          ))}
          {ticks.map(tick => (
            <span key={`sizer-${tick}`} className={styles.ySizer}>
              {tickLabel(tick)}
            </span>
          ))}
        </div>

        <div className={styles.canvas} style={{ height }}>
          <div role="img" aria-label={ariaLabel} className={styles.marks}>
            {ticks.map(tick => (
              <div key={tick} className={styles.gridline} data-baseline={tick === 0 || undefined} style={{ bottom: `${level(tick)}%` }} />
            ))}
            {type === 'bar' && activeIndex !== null ? <div className={styles.wash} style={bandStyle(activeIndex, count)} /> : null}
            {type === 'bar' ? bars : lines}
            {type !== 'bar' && activeIndex !== null ? <div className={styles.crosshair} style={{ left: centerOf(activeIndex, count) }} /> : null}
            {type !== 'bar' && dotIndex !== null
              ? plotted.map((entry, i) => (
                  <div
                    key={i}
                    className={cn(styles.series, styles.dot)}
                    data-slot={entry.slot}
                    style={{ left: centerOf(dotIndex, count), bottom: `${geometry[i]?.upper[dotIndex] ?? 0}%` }}
                  />
                ))
              : null}
          </div>

          <Popover
            open={activeDatum !== undefined}
            onOpenChange={open => {
              if (!open) setActive(null);
            }}
          >
            <Popover.Anchor key={activeIndex ?? 'idle'} asChild>
              <div className={styles.anchor} style={bandStyle(activeIndex ?? 0, count)} />
            </Popover.Anchor>
            {activeDatum !== undefined ? (
              <Popover.Content
                className={styles.tooltip}
                side="right"
                align="start"
                aria-label={activeLabel}
                aria-hidden="true"
                onOpenAutoFocus={event => event.preventDefault()}
                onCloseAutoFocus={event => event.preventDefault()}
                onFocusOutside={event => event.preventDefault()}
              >
                <div className={styles.tooltipTitle}>{activeLabel}</div>
                <dl className={styles.tooltipRows}>
                  {plotted.map((entry, i) => (
                    <div key={i} className={styles.tooltipRow}>
                      <dt className={styles.tooltipLabel}>
                        <span className={cn(styles.series, styles.key)} data-slot={entry.slot} data-shape={swatchShape(type)} />
                        {entry.label}
                      </dt>
                      <dd className={styles.tooltipValue}>{formatCell(readValue(activeDatum, entry.key))}</dd>
                    </div>
                  ))}
                  {showTotal ? (
                    <div className={styles.tooltipRow} data-total>
                      <dt className={styles.tooltipLabel}>Total</dt>
                      <dd className={styles.tooltipValue}>{formatCell(columnTotal(activeDatum, series))}</dd>
                    </div>
                  ) : null}
                </dl>
              </Popover.Content>
            ) : null}
          </Popover>

          <div className={styles.columns} role="group" aria-label={`${ariaLabel}, data points`} onKeyDown={onKeyDown} onPointerLeave={onPointerLeave} onBlur={onBlur}>
            {data.map((datum, index) => (
              <div
                key={index}
                ref={node => {
                  columnRefs.current[index] = node;
                }}
                role="img"
                aria-label={summary(datum, index)}
                tabIndex={index === rovingIndex ? 0 : -1}
                className={styles.column}
                style={bandStyle(index, count)}
                onPointerEnter={() => setActive(index)}
                onFocus={() => {
                  setTabStop(index);
                  setActive(index);
                }}
              />
            ))}
          </div>
        </div>

        <div className={styles.xAxis} aria-hidden="true">
          {labelPlan.indices.map(index => {
            const box = labelBox(index, labelPlan.step, count);
            return (
              <span key={index} className={styles.xTick} data-align={box.align} style={{ left: `${box.left}%`, width: `${box.width}%` }}>
                {xLabels[index]}
              </span>
            );
          })}
        </div>
      </div>

      {legend && series.length > 1 ? (
        <ul className={styles.legend} aria-hidden="true">
          {plotted.map((entry, i) => (
            <li key={i} className={styles.legendItem}>
              <span className={cn(styles.series, styles.key)} data-slot={entry.slot} data-shape={swatchShape(type)} />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}

      <table className={styles.srOnly}>
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <td />
            {series.map((entry, i) => (
              <th key={i} scope="col">
                {entry.label}
              </th>
            ))}
            {showTotal ? <th scope="col">Total</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.map((datum, index) => (
            <tr key={index}>
              <th scope="row">{xLabels[index]}</th>
              {series.map((entry, i) => (
                <td key={i}>{formatCell(readValue(datum, entry.key))}</td>
              ))}
              {showTotal ? <td>{formatCell(columnTotal(datum, series))}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
