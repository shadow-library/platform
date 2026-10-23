import { Injectable, type OnModuleInit } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';

import { type TelemetryEvent } from './events';
import { assertTelemetryPseudoIdSecret } from './pseudo-id';

/** The single emitter for the closed analytics taxonomy; `TelemetryEvent` payload types make free text unrepresentable, so it only logs what it is handed. */
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
