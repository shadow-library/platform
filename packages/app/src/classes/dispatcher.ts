import { Class } from 'type-fest';

import { ControllerMetadata, HandlerMetadata, Injectable } from '../decorators';

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

@Injectable()
export abstract class Dispatcher {
  /** Decides which handler runs for a trigger: an HTTP request, a CLI command, a worker event and so on. */
  abstract register(controllers: DispatchMetadata[]): any | Promise<any>;

  abstract start(): any | Promise<any>;

  abstract stop(): any | Promise<any>;
}
