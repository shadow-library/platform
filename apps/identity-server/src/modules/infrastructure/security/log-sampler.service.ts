import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';

import { DatabaseService } from '@server/modules/infrastructure/datastore';

/**
 * Caps how often a repeating condition is written to the log, so one misconfigured caller cannot drown it.
 * The slot is claimed atomically, so every replica shares a window instead of each logging its own.
 */
@Injectable()
export class LogSamplerService {
  private readonly redis: Redis;

  constructor(databaseService: DatabaseService) {
    this.redis = databaseService.getRedisClient();
  }

  /** Fails open: an unreachable Redis must never silence a security log line. */
  async claim(slot: string, windowSeconds: number): Promise<boolean> {
    return this.redis
      .set(slot, '1', 'EX', windowSeconds, 'NX')
      .then(result => result === 'OK')
      .catch(() => true);
  }
}
