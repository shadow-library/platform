/**
 * Importing npm packages
 */
import { DoneFuncWithErrOrRes, FastifyReply, FastifyRequest } from 'fastify';

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

export type AsyncRouteHandler = (request: HttpRequest, response: HttpResponse) => Promise<unknown>;

export type RouteHandler<T extends (...args: any[]) => any = any> = ReturnType<T> extends Promise<unknown> ? AsyncRouteHandler : CallbackRouteHandler;
