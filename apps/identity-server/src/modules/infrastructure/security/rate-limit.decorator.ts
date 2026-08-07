import { Handler } from '@shadow-library/app';

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
}

type RateLimitDecorator = ClassDecorator & MethodDecorator;

export const RATE_LIMIT_METADATA = 'rateLimit';

export const RateLimit = (policy: RateLimitPolicy): RateLimitDecorator => Handler({ [RATE_LIMIT_METADATA]: policy });
