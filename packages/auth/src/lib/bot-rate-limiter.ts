export type BotRateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface BotRateLimiterOptions {
  maxBuckets?: number;
  now?: () => number;
}

interface TokenBucket {
  capacity: number;
  tokens: number;
  refilledAt: number;
}

// Per replica, with no shared store, so the effective limit is `rl` times the replica count. An idle bucket is back at capacity, so evicting it is free;
// when every bucket is active the closest to full is evicted, handing that bot back a few spent tokens (bounded leniency, only beyond the cap).
const DEFAULT_MAX_BUCKETS = 10_000;
const WINDOW_MS = 60_000;

export class BotRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly now: () => number;

  constructor(private readonly options: BotRateLimiterOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  consume(botId: string, perMinute: number): BotRateDecision {
    const now = this.now();
    const bucket = this.refill(this.buckets.get(botId), perMinute, now);
    this.buckets.delete(botId);
    this.evict(now);
    this.buckets.set(botId, bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    const msUntilToken = ((1 - bucket.tokens) * WINDOW_MS) / bucket.capacity;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(msUntilToken / 1000)) };
  }

  private refill(bucket: TokenBucket | undefined, capacity: number, now: number): TokenBucket {
    if (!bucket) return { capacity, tokens: capacity, refilledAt: now };
    const elapsed = Math.max(0, now - bucket.refilledAt);
    return { capacity, tokens: Math.min(capacity, bucket.tokens + (elapsed * capacity) / WINDOW_MS), refilledAt: now };
  }

  private evict(now: number): void {
    if (this.buckets.size < (this.options.maxBuckets ?? DEFAULT_MAX_BUCKETS)) return;

    const [oldestId, oldest] = this.buckets.entries().next().value ?? [];
    if (oldestId === undefined || !oldest) return;
    if (now - oldest.refilledAt >= WINDOW_MS) {
      this.buckets.delete(oldestId);
      return;
    }

    let fullestId = oldestId;
    let fullest = 0;
    for (const [id, bucket] of this.buckets) {
      const fill = this.refill(bucket, bucket.capacity, now).tokens / bucket.capacity;
      if (fill <= fullest) continue;
      fullestId = id;
      fullest = fill;
    }
    this.buckets.delete(fullestId);
  }
}
