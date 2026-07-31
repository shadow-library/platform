/**
 * Importing packages with side effects
 */

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

/**
 * Declaring the constants
 */

@Schema()
export class HealthResponse {
  @Field(() => String, { enum: ['ok'] })
  status: 'ok';
}

@Schema()
export class HealthDependencies {
  @Field(() => String, { enum: ['up', 'down'] })
  postgres: 'up' | 'down';
}

@Schema()
export class ReadyResponse {
  @Field(() => String, { enum: ['ok', 'degraded'] })
  status: 'ok' | 'degraded';

  @Field(() => HealthDependencies)
  dependencies: HealthDependencies;
}
