import { Delete, HttpController, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';
import { AdminUserService } from '@server/modules/admin';

import { AccountCloseResponse } from './account-close.dto';

@HttpController('/api/v1/me')
@Auth({ elevated: true })
export class AccountCloseController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Delete()
  @RespondFor(200, AccountCloseResponse)
  async closeAccount(): Promise<AccountCloseResponse> {
    const session = Context.getSession();
    await this.adminUserService.softDelete(session.userId, { actorId: session.userId.toString() });
    return { success: true };
  }
}
