import { Delete, Get, HttpController, Params, RespondFor } from '@shadow-library/fastify';

import { Auth, Context } from '@server/modules/access';

import { MeSessionsResponse, SessionIdParams, SessionsRevokedResponse } from './me-sessions.dto';
import { type MeSessionListItem, MeSessionsService } from './me-sessions.service';

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
