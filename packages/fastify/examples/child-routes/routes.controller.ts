/**
 * Importing npm packages
 */
import { type JsonObject } from 'type-fest';

import { Dispatcher, Inject } from '@shadow-library/app';
import { ContextService, FastifyRouter, Get, HttpController, Query } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface RouteResponse {
  message: string;
  rid: string;
}

export interface UnifiedRouteResponse extends RouteResponse {
  results: JsonObject[];
}

/**
 * Declaring the constants
 */

@HttpController('/api')
export class RoutesController {
  constructor(
    private readonly contextService: ContextService,
    @Inject(Dispatcher) private readonly fastifyRouter: FastifyRouter,
  ) {}

  @Get('/hello')
  getHello(): RouteResponse {
    const rid = this.contextService.getRID();
    return { message: 'Hello World!', rid };
  }

  @Get('/welcome')
  getWelcome(): RouteResponse {
    const rid = this.contextService.getRID();
    return { message: 'Welcome to Fastify with Shadow!', rid };
  }

  @Get('/greet')
  getGreet(@Query() params: Record<string, any>): RouteResponse {
    const rid = this.contextService.getRID();
    return { message: `Hello, ${params.name ?? 'stranger'}!`, rid };
  }

  @Get('/unified')
  async unifiedRoute(@Query() query: Record<string, any>): Promise<UnifiedRouteResponse> {
    const rid = this.contextService.getRID();
    const results: JsonObject[] = [];
    for (const route of query.routes?.split(',') ?? []) {
      const childRouteResult = await this.fastifyRouter.resolveChildRoute(route);
      results.push(childRouteResult);
    }
    return { message: 'Unified Route', rid, results };
  }
}
