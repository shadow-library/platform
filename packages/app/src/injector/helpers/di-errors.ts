/**
 * Importing npm packages
 */
import { InternalError, NeverError } from '@shadow-library/common';
import { Class } from 'type-fest';

/**
 * Importing user defined packages
 */
import { InjectionToken } from '../../interfaces';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class DIErrorsStatic {
  private getTokenName(token: InjectionToken): string {
    return typeof token === 'function' ? token.name : token.toString();
  }

  unexpected(message: string): NeverError {
    message += `\n\nThis is most likely a bug. Please, report it to the Shadow Library team.`;
    return new NeverError(message);
  }

  undefinedDependency(parent: InjectionToken, index: number): never {
    parent = this.getTokenName(parent);
    let message = `Cannot resolve dependencies of ${parent}.`;
    message += ` The dependency at index ${index} cannot be resolved.`;
    message += `This might be due to circular dependency. Use forwardRef() to avoid it.`;
    throw new InternalError(message);
  }

  unknownExport(token: InjectionToken, module: Class<unknown>): never {
    token = this.getTokenName(token);
    let message = `You cannot export a provider that is not a part of the currently processed module (${module.name}).`;
    message += `Please verify whether the exported ${token} is available in this particular context.`;
    throw new InternalError(message);
  }

  notFound(token: InjectionToken, module: Class<unknown>): never {
    const tokenName = this.getTokenName(token);
    let message = `Provider '${tokenName}' not found or exported in module '${module.name}'.`;
    message += ` Make sure that it is part of the providers array of the current module.`;
    throw new InternalError(message);
  }

  duplicateDynamicModule(module: Class<unknown>): never {
    let message = `Module '${module.name}' with dynamic configuration has already been registered.\n`;
    message += ` Dynamic modules must be imported only once with their metadata configuration.`;
    message += ` To reuse this module elsewhere, import the module class directly in the module's imports array.`;
    throw new InternalError(message);
  }
}

export const DIErrors = new DIErrorsStatic();
