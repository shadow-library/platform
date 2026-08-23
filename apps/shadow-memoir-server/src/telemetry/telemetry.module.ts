import { Module } from '@shadow-library/app';

import { TelemetryService } from './telemetry.service';

@Module({ providers: [TelemetryService], exports: [TelemetryService] })
export class TelemetryModule {}
