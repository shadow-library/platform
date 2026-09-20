import { Injectable, type OnApplicationReady, type OnApplicationStop } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { logMetric } from '@server/telemetry';

import { type Gauge, type GaugeFn, type Sweep, type SweepFn } from './scheduler.types';

@Injectable()
export class SchedulerService implements OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(APP_NAME, SchedulerService.name);
  private readonly enabled = Config.get('scheduler.enabled');
  private readonly tickIntervalMs = Config.get('scheduler.tick-interval-ms');
  private readonly sweeps: Sweep[] = [];
  private readonly gauges: Gauge[] = [];

  private timer?: ReturnType<typeof setInterval>;
  private current: Promise<void> | null = null;
  private running = false;
  private ticks = 0;

  registerSweep(name: string, cadenceMs: number, fn: SweepFn): void {
    if (this.sweeps.some(sweep => sweep.name === name)) throw AppError.internal(`Sweep "${name}" is already registered`);
    this.sweeps.push({ name, cadenceMs, fn, lastRunAt: 0 });
  }

  /**
   * Registers a gauge sampled once per heartbeat and logged in the standard `metric`-tagged format
   * (T-28). The registration point exists independently of any sweep so a subsystem that only lands
   * later (queue depths, rollover failures, orphan counts) can wire its counter in without waiting on
   * this service to change.
   */
  registerGauge(metric: string, fn: GaugeFn): void {
    if (this.gauges.some(gauge => gauge.metric === metric)) throw AppError.internal(`Gauge "${metric}" is already registered`);
    this.gauges.push({ metric, fn });
  }

  async onApplicationReady(): Promise<void> {
    if (!this.enabled) {
      this.logger.info('Scheduler disabled by config; tick loop not started', { sweeps: this.sweeps.map(sweep => sweep.name) });
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.tickIntervalMs);
    this.logger.info('Scheduler started', { intervalMs: this.tickIntervalMs, sweeps: this.sweeps.map(sweep => sweep.name) });
  }

  async onApplicationStop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.current) await this.current;
    this.logger.info('Scheduler drained and stopped');
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.current = this.runDueSweeps();
    try {
      await this.current;
    } finally {
      this.running = false;
      this.current = null;
    }
  }

  private sampleGauges(): void {
    for (const gauge of this.gauges) {
      try {
        logMetric(this.logger, 'Scheduler gauge sample', gauge.metric, gauge.fn());
      } catch (error) {
        this.logger.error('Gauge sample failed', { metric: gauge.metric, error });
      }
    }
  }

  private async runDueSweeps(): Promise<void> {
    const now = Date.now();
    const due = this.sweeps.filter(sweep => now - sweep.lastRunAt >= sweep.cadenceMs);
    const ran: string[] = [];
    const failed: string[] = [];

    for (const sweep of due) {
      sweep.lastRunAt = now;
      try {
        await sweep.fn();
        ran.push(sweep.name);
      } catch (error) {
        failed.push(sweep.name);
        this.logger.error('Sweep failed', { sweep: sweep.name, error });
      }
    }

    this.ticks++;
    this.sampleGauges();
    logMetric(this.logger, 'Scheduler heartbeat', 'scheduler.tick', this.ticks, { registered: this.sweeps.length, ran, failed });
  }
}
