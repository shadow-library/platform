/**
 * Importing npm packages
 */
import { DoneFuncWithErrOrRes, FastifyReply, FastifyRequest } from 'fastify';
import { Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export type HttpRequest = FastifyRequest;

export type HttpResponse = FastifyReply;

export type HttpCallback = DoneFuncWithErrOrRes;

export type CallbackRouteHandler = (request: HttpRequest, response: HttpResponse, done: HttpCallback) => unknown;

export type AwaitableRouteHandler = (request: HttpRequest, response: HttpResponse) => Promisable<unknown>;

export type RouteHandler<T extends (...args: any[]) => any = any> = ReturnType<T> extends Promise<any> ? AwaitableRouteHandler : AwaitableRouteHandler;
