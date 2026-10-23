import { Promisable } from 'type-fest';

import { SyncValue } from './value.interface';

export type Fn<T = any, U = any> = (...args: U[]) => Promisable<T>;

export type SyncFn<T = any> = (...args: any[]) => SyncValue<T>;

export type AsyncFn<T = any> = (...args: any[]) => Promise<T>;
