/**
 * Importing npm packages
 */
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { ControllerMetadata, HandlerMetadata, Injectable } from '../decorators';

/**
 * Defining types
 */

export interface HandlerDescriptor {
  metadata: HandlerMetadata;
  handlerName: string;
  handler: (...args: any[]) => any | Promise<any>;
  paramtypes: Class<unknown>[];
  returnType?: Class<unknown>;
}

export interface DispatchMetadata {
  metatype: Class<unknown>;
  metadata: ControllerMetadata;
  instance: object;
  handlers: HandlerDescriptor[];
}

/**
 * Declaring the constants
 */

@Injectable()
export abstract class Dispatcher {
  /**
   * Called to register the controllers with their handlers.
   * A dispatcher decides which handler runs when a trigger arrives — an HTTP request,
   * a CLI command, a desktop screen change, a worker event, and so on.
   */
  abstract register(controllers: DispatchMetadata[]): any | Promise<any>;

  /**
   * Called to start the dispatcher.
   * For a server this would listen on a port; for a CLI it would begin reading commands.
   */
  abstract start(): any | Promise<any>;

  /**
   * Called to stop the dispatcher.
   * For a server this would stop listening and close connections.
   */
  abstract stop(): any | Promise<any>;
}
