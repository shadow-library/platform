import { type ChartDatum, type ChartSeries } from './Chart.types';

export interface ChartTicks {
  top: number;
  ticks: number[];
}

export interface ChartSegment {
  start: number;
  end: number;
}

export interface ChartLabelBox {
  left: number;
  width: number;
  align: 'start' | 'center' | 'end';
}

export interface ChartLabelPlan {
  step: number;
  indices: number[];
}

/** A rough step rounds to the nearest of 1, 2, 5 or 10 on a log scale, so the tick count lands near the request rather than always under it. */
const NICE_FACTORS = [
  { factor: 1, below: Math.SQRT2 },
  { factor: 2, below: Math.sqrt(10) },
  { factor: 5, below: Math.sqrt(50) },
];
const EPSILON = 1e-9;
const LABEL_BUDGET_CHARS = 64;
const LABEL_GAP_CHARS = 3;
const MIN_LABELS = 2;
const MAX_LABELS = 12;
const PALETTE_SIZE = 8;

export function niceTicks(max: number, intervals: number): ChartTicks {
  const ceiling = Number.isFinite(max) && max > 0 ? max : 1;
  const rough = ceiling / Math.max(1, intervals);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const factor = NICE_FACTORS.find(({ below }) => residual < below)?.factor ?? 10;
  const step = factor * magnitude;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + EPSILON));
  const count = Math.ceil(ceiling / step - EPSILON);
  const ticks = Array.from({ length: count + 1 }, (_, i) => Number((i * step).toFixed(decimals)));
  return { top: Number((count * step).toFixed(decimals)), ticks };
}

export function readValue(datum: ChartDatum, key: string): number {
  const value = datum.values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function columnTotal(datum: ChartDatum, series: readonly ChartSeries[]): number {
  return series.reduce((sum, entry) => sum + readValue(datum, entry.key), 0);
}

export function stackColumn(datum: ChartDatum, series: readonly ChartSeries[]): ChartSegment[] {
  let start = 0;
  return series.map(entry => {
    const end = start + Math.max(0, readValue(datum, entry.key));
    const segment = { start, end };
    start = end;
    return segment;
  });
}

export function domainMax(data: readonly ChartDatum[], series: readonly ChartSeries[], stacked: boolean): number {
  let max = 0;
  for (const datum of data) {
    if (stacked) max = Math.max(max, stackColumn(datum, series).at(-1)?.end ?? 0);
    else for (const entry of series) max = Math.max(max, readValue(datum, entry.key));
  }
  return max;
}

export function planLabels(labels: readonly string[]): ChartLabelPlan {
  if (labels.length === 0) return { step: 1, indices: [] };
  const longest = Math.max(...labels.map(label => label.length));
  const capacity = Math.min(MAX_LABELS, Math.max(MIN_LABELS, Math.floor(LABEL_BUDGET_CHARS / (longest + LABEL_GAP_CHARS))));
  const step = Math.ceil(labels.length / capacity);
  const last = labels.length - 1;
  const indices = labels.map((_, i) => i).filter(i => (last - i) % step === 0);
  return { step, indices };
}

/** Each label owns `step` bands centred on its point, trimmed at the plot edges, so neighbouring labels can never overlap. */
export function labelBox(index: number, step: number, count: number): ChartLabelBox {
  const center = ((index + 0.5) / count) * 100;
  const half = (step / count) * 50;
  const clippedStart = center - half < -EPSILON;
  const clippedEnd = center + half > 100 + EPSILON;
  const left = clippedStart ? 0 : center - half;
  const right = clippedEnd ? 100 : center + half;
  const align = clippedStart === clippedEnd ? 'center' : clippedStart ? 'start' : 'end';
  return { left, width: right - left, align };
}

export function linePath(levels: readonly number[]): string {
  return levels.map((level, i) => `${i === 0 ? 'M' : 'L'}${i + 0.5} ${100 - level}`).join('');
}

export function areaPath(upper: readonly number[], lower: readonly number[]): string {
  const back = lower.map((level, i) => ({ level, i })).reverse();
  return `${linePath(upper)}${back.map(({ level, i }) => `L${i + 0.5} ${100 - level}`).join('')}Z`;
}

const wrapSlot = (slot: number): number => ((((Math.round(slot) - 1) % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE) + 1;

export function resolveSlots(series: readonly ChartSeries[]): string[] {
  const coloured = series.filter(entry => entry.tone !== 'neutral');
  const pinned = new Set(coloured.flatMap(entry => (entry.slot !== undefined && Number.isFinite(entry.slot) ? [wrapSlot(entry.slot)] : [])));
  const free = Array.from({ length: PALETTE_SIZE }, (_, i) => i + 1).filter(slot => !pinned.has(slot));
  const pool = free.length > 0 ? free : Array.from({ length: PALETTE_SIZE }, (_, i) => i + 1);
  let next = 0;
  return series.map(entry => {
    if (entry.tone === 'neutral') return 'neutral';
    if (entry.slot !== undefined && Number.isFinite(entry.slot)) return String(wrapSlot(entry.slot));
    return String(pool[next++ % pool.length]);
  });
}
