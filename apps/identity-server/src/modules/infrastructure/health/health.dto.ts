/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type HealthStatus = 'ok' | 'degraded';
export type DependencyStatus = 'up' | 'down';

/**
 * Declaring the constants
 */

@Schema()
export class HealthResponse {
  @Field(() => String, { enum: ['ok', 'degraded'] })
  status: HealthStatus;
}

@Schema()
export class ReadinessDependencies {
  @Field(() => String, { enum: ['up', 'down'] })
  postgres: DependencyStatus;

  @Field(() => String, { enum: ['up', 'down'] })
  redis: DependencyStatus;
}

@Schema()
export class ReadinessResponse {
  @Field(() => String, { enum: ['ok', 'degraded'] })
  status: HealthStatus;

  @Field(() => ReadinessDependencies)
  dependencies: ReadinessDependencies;
}
