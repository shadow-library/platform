export type SweepFn = () => Promise<void> | void;

export interface Sweep {
  name: string;
  cadenceMs: number;
  fn: SweepFn;
  lastRunAt: number;
}

/** A synchronous point-in-time reading (queue depth, orphan count, …) sampled once per heartbeat. */
export type GaugeFn = () => number;

export interface Gauge {
  metric: string;
  fn: GaugeFn;
}
