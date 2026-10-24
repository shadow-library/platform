import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type ChartType = 'bar' | 'line' | 'area';

export type ChartSeriesTone = 'neutral';

export interface ChartDatum {
  /** The category or period; displayed through `formatX`. */
  x: string;
  /** Value per series key. A missing or non-finite value reads as 0; a negative value is drawn at 0 but listed as given. */
  values: Record<string, number>;
}

export interface ChartSeries {
  key: string;
  label: string;
  /** `neutral` paints an "Other" bucket in `--sh-chart-neutral` and takes no palette slot. */
  tone?: ChartSeriesTone;
}

export interface ChartProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'aria-label'> {
  type: ChartType;
  data: ChartDatum[];
  /** Palette slots go to non-neutral series in order, so a series keeps its colour only at a stable index. Eight coloured series at most: fold the rest into a neutral one. */
  series: ChartSeries[];
  /** Stacks bars and areas from the first series up; lines never stack. @default false */
  stacked?: boolean;
  /** Formats values in the tooltip and the data table. @default en-US, up to two decimals */
  formatValue?: (value: number) => string;
  /** Formats y-axis tick labels only. @default compact, e.g. 1.2K */
  formatTick?: (value: number) => string;
  formatX?: (x: string) => string;
  /** Plot height in px, excluding the x-axis labels and the legend. @default 240 */
  height?: number;
  /** Names the chart for assistive technology and captions its data table. */
  'aria-label': string;
  /** Replaces the plot when there is no data or no series. @default an inline "No data" EmptyState */
  emptyState?: ReactNode;
  /** Legend under the plot; a single series never shows one, since the surrounding title names it. @default true */
  legend?: boolean;
}
