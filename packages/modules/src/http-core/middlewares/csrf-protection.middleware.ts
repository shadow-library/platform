/**
 * Importing npm packages
 */
import { Inject } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { AsyncRouteHandler, Middleware, MiddlewareGenerator, ServerError, ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { DEFAULT_CONFIGS, HTTP_CORE_CONFIGS, LOGGER_NAMESPACE } from '../http-core.constants';
import { type HttpCoreModuleOptions } from '../http-core.types';
import { CSRFTokenService } from '../services';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Middleware({ type: 'onRequest', weight: 90 })
export class CsrfProtectionMiddleware implements MiddlewareGenerator {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'CsrfProtectionMiddleware');

  constructor(
    @Inject(HTTP_CORE_CONFIGS) private readonly options: HttpCoreModuleOptions,
    private readonly csrfTokenService: CSRFTokenService,
  ) {}

  private hasCookies(cookies: Record<string, string | undefined>): boolean {
    for (const _ in cookies) return true;
    return false;
  }

  generate(): AsyncRouteHandler | undefined {
    if (this.options.csrf.disabled === true) return;
    const isCSRFEnabled = Config.register('http-core.csrf.enabled', DEFAULT_CONFIGS['http-core.csrf.enabled']);
    return async (request, response) => {
      if (!this.hasCookies(request.cookies)) return;
      if (!Config.isProd() && !isCSRFEnabled) return;

      const result = this.csrfTokenService.validateToken(request);
      const isMutation = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS';

      if (isMutation && !result.isValid) throw new ServerError(ServerErrorCode.S010);
      if (!result.isValid || result.shouldRefresh) {
        const token = this.csrfTokenService.generateToken();
        response.setCookie(token.name, token.value, token.options);
        this.logger.debug('CSRF token set/updated', { token });
      }
    };
  }
}
