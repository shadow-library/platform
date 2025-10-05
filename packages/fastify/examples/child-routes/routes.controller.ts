/**
 * Importing npm packages
 */
import { Inject, Router } from '@shadow-library/app';
import { ContextService, FastifyRouter, Get, HttpController, Query } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api')
export class RoutesController {
  constructor(
    private readonly contextService: ContextService,
    @Inject(Router) private readonly fastifyRouter: FastifyRouter,
  ) {}

  @Get('/hello')
  getHello() {
    const rid = this.contextService.getRID();
    return { message: 'Hello World!', rid };
  }

  @Get('/welcome')
  getWelcome() {
    const rid = this.contextService.getRID();
    return { message: 'Welcome to Fastify with Shadow!', rid };
  }

  @Get('/greet')
  getGreet(@Query() params: Record<string, any>) {
    const rid = this.contextService.getRID();
    return { message: `Hello, ${params.name ?? 'stranger'}!`, rid };
  }

  @Get('/unified')
  async unifiedRoute(@Query() query: Record<string, any>) {
    const rid = this.contextService.getRID();
    const results: object[] = [];
    for (const route of query.routes?.split(',') ?? []) {
      const childRouteResult = await this.fastifyRouter.resolveChildRoute(route);
      results.push(childRouteResult);
    }
    return { message: 'Unified Route', rid, results };
  }
}
