export type SweepFn = () => Promise<void> | void;

export interface Sweep {
  name: string;
  cadenceMs: number;
  fn: SweepFn;
  seeded: boolean;
  lastRunAt: number;
}

export interface SweepRun {
  claimed: boolean;
  lastRunAt: Date;
}

export type GaugeFn = () => number;

export interface Gauge {
  metric: string;
  fn: GaugeFn;
}
