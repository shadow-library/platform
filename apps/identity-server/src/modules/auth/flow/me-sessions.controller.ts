/**
 * Importing npm packages
 */
import { Delete, Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Auth, Context } from '@server/modules/access';

import { MeSessionsResponse, SessionIdParams, SessionsRevokedResponse } from './me-sessions.dto';
import { type MeSessionListItem, MeSessionsService } from './me-sessions.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Self-service session management: users see every device holding a live session and can cut any of
 * them loose. Revocations require a fresh second-factor proof so a hijacked idle session cannot
 * silently evict the owner.
 */

@HttpController('/api/v1/me/sessions')
@Auth({ session: true })
export class MeSessionsController {
  constructor(private readonly meSessionsService: MeSessionsService) {}

  private caller() {
    return { session: Context.getSession(), ip: Context.getClientInfo().ip };
  }

  @Get()
  @RespondFor(200, MeSessionsResponse)
  async listMySessions(): Promise<{ sessions: MeSessionListItem[] }> {
    return { sessions: await this.meSessionsService.listMySessions(Context.getSession()) };
  }

  @Delete('/:sessionId')
  @Auth({ elevated: true })
  @RespondFor(200, SessionsRevokedResponse)
  revokeMySession(@Params() params: SessionIdParams): Promise<{ revoked: number }> {
    return this.meSessionsService.revokeMySession(this.caller(), params.sessionId);
  }

  @Delete()
  @Auth({ elevated: true })
  @RespondFor(200, SessionsRevokedResponse)
  revokeMyOtherSessions(): Promise<{ revoked: number }> {
    return this.meSessionsService.revokeMyOtherSessions(this.caller());
  }
}
