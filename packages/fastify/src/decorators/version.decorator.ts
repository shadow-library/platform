import { Integer } from 'type-fest';
import { Handler } from '@shadow-library/app';

export function Version<T extends number>(version: Integer<T>): ClassDecorator & MethodDecorator {
  return Handler({ version });
}
