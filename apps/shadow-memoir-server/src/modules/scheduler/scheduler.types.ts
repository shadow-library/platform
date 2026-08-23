export type SweepFn = () => Promise<void> | void;

export interface Sweep {
  name: string;
  cadenceMs: number;
  fn: SweepFn;
  lastRunAt: number;
}
