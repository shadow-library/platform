import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';

import { ServiceTokenService } from '@server/modules/infrastructure/service-token';

const NOTIFICATIONS_SEND_SCOPE = 'notifications:send';

@Injectable()
export class NotificationTokenService {
  private readonly audience = Config.get('notification.audience');

  constructor(private readonly serviceTokenService: ServiceTokenService) {}

  getToken(): Promise<string> {
    return this.serviceTokenService.getToken(this.audience, NOTIFICATIONS_SEND_SCOPE);
  }

  invalidate(): void {
    this.serviceTokenService.invalidate(this.audience, NOTIFICATIONS_SEND_SCOPE);
  }
}
