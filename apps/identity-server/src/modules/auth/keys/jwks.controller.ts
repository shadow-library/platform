/**
 * Importing npm packages
 */
import { Get, Header, HttpController, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

import { KeyService } from './key.service';
import { JwksResponse } from './keys.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController()
export class JwksController {
  constructor(private readonly keyService: KeyService) {}

  @Get('/.well-known/jwks.json')
  @Header('cache-control', 'public, max-age=300')
  @RespondFor(200, JwksResponse)
  jwks(): JwksResponse {
    return this.keyService.getJwks();
  }
}
