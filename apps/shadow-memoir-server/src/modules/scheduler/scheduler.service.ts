import { Injectable, type OnApplicationReady, type OnApplicationStop } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type Sweep, type SweepFn } from './scheduler.types';

@Injectable()
export class SchedulerService implements OnApplicationReady, OnApplicationStop {
  private readonly logger = Logger.getLogger(APP_NAME, SchedulerService.name);
  private readonly enabled = Config.get('scheduler.enabled');
  private readonly tickIntervalMs = Config.get('scheduler.tick-interval-ms');
  private readonly sweeps: Sweep[] = [];

  private timer?: ReturnType<typeof setInterval>;
  private current: Promise<void> | null = null;
  private running = false;
  private ticks = 0;

  registerSweep(name: string, cadenceMs: number, fn: SweepFn): void {
    if (this.sweeps.some(sweep => sweep.name === name)) throw AppError.internal(`Sweep "${name}" is already registered`);
    this.sweeps.push({ name, cadenceMs, fn, lastRunAt: 0 });
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
    this.logger.info('Scheduler heartbeat', { tick: this.ticks, registered: this.sweeps.length, ran, failed });
  }
}
