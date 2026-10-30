import { callService } from '../service-call';
import { type ServiceFetch, type ServiceTarget } from '../service-fetch';
import { type CallOptions, type ServiceResponse } from '../service-response';
import { type CreateNotificationBody, type CreateNotificationResponse } from './pulse-api.gen';

export const PULSE_TARGET: ServiceTarget = { service: 'pulse-server', resource: 'api://pulse', scopes: ['notifications:send'] };

export class PulseClient {
  constructor(
    private readonly fetch: ServiceFetch,
    private readonly target: ServiceTarget = PULSE_TARGET,
  ) {}

  sendNotification(body: CreateNotificationBody, options: CallOptions = {}): Promise<ServiceResponse<CreateNotificationResponse>> {
    return callService(this.fetch, this.target, { ...options, method: 'POST', path: '/api/v1/notifications', body });
  }
}
