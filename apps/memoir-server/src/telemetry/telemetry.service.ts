/**
 * Importing npm packages
 */
import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

import { type TelemetryEvent } from './events';
import { assertTelemetryPseudoIdSecret } from './pseudo-id';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The single emitter for the closed analytics taxonomy (ARCHITECTURE §23–24). `TelemetryEvent`'s payload
 * types make a free-text field unrepresentable, so this service needs no field-level scrubbing of its
 * own — it only has to log what it was handed, structurally.
 */
@Injectable()
export class TelemetryService implements OnModuleInit {
  private readonly logger = Logger.getLogger(APP_NAME, TelemetryService.name);

  onModuleInit(): void {
    assertTelemetryPseudoIdSecret(Config.get('telemetry.pseudo-id-secret'));
  }

  emit(event: TelemetryEvent): void {
    const { name, ...payload } = event;
    this.logger.info('telemetry.event', { channel: 'telemetry', name, payload });
  }
}
