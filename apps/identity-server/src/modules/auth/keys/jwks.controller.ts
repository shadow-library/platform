import { Get, Header, HttpController, RespondFor } from '@shadow-library/fastify';

import { Auth } from '@server/modules/access';

import { KeyService } from './key.service';
import { JwksResponse } from './keys.dto';

@HttpController()
export class JwksController {
  constructor(private readonly keyService: KeyService) {}

  @Get('/.well-known/jwks.json')
  @Auth({ public: true })
  @Header('cache-control', 'public, max-age=300')
  @RespondFor(200, JwksResponse)
  getJwks(): JwksResponse {
    return this.keyService.getJwks();
  }
}
