import { Handler } from '@shadow-library/app';

declare module '@shadow-library/app' {
  export interface HandlerMetadata {
    authGuard?: AuthGuardOptions;
  }
}

export interface AuthGuardOptions {
  accessLevel: number;
}

export function AuthGuard(options: AuthGuardOptions): ClassDecorator & MethodDecorator {
  return Handler({ authGuard: options });
}
