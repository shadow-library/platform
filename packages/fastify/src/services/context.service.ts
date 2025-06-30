/**
 * Importing npm packages
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@shadow-library/app';
import { InternalError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { HttpRequest, HttpResponse, MiddlewareHandler } from '../interfaces';
import { ChildRouteRequest } from '../module';

/**
 * Defining types
 */

type Key = string | symbol;

/**
 * Declaring the constants
 */
const REQUEST = Symbol('request');
const RESPONSE = Symbol('response');
const RID = Symbol('rid');
const PARENT_CONTEXT = Symbol('parent-context');
const CHILD_RID_COUNTER = Symbol('child-rid-counter');
const CHILD_REQUEST = Symbol('child-request');

@Injectable()
export class ContextService {
  static readonly name = 'ContextService';

  private readonly storage = new AsyncLocalStorage<Map<Key, unknown>>();

  init(): MiddlewareHandler {
    return async (req, res) => {
      const store = new Map<Key, unknown>();
      store.set(REQUEST, req);
      store.set(RESPONSE, res);
      store.set(RID, req.id);
      this.storage.enterWith(store);
    };
  }

  initChild(): (request: ChildRouteRequest) => Promise<void> {
    return async req => {
      const parentStore = this.storage.getStore();
      if (!parentStore) throw new InternalError('Parent context not initialized');
      const isChildContext = parentStore.has(PARENT_CONTEXT);
      if (isChildContext) throw new InternalError('Cannot create a child context within an existing child context');

      const childRIDCounter = (this.get<number>(CHILD_RID_COUNTER) ?? 0) + 1;
      this.set(CHILD_RID_COUNTER, childRIDCounter);
      const childRID = `${this.getRID()}-${childRIDCounter}`;

      const store = new Map<Key, unknown>();
      store.set(RID, childRID);
      store.set(CHILD_REQUEST, req);
      store.set(PARENT_CONTEXT, parentStore);
      this.storage.enterWith(store);
    };
  }

  get<T>(key: Key, throwOnMissing: true): T;
  get<T>(key: Key, throwOnMissing?: boolean): T | null;
  get<T>(key: Key, throwOnMissing?: boolean): T | null {
    const store = this.storage.getStore();
    if (!store) throw new InternalError('Context not yet initialized');
    const value = store.get(key) as T | undefined;
    if (throwOnMissing && value === undefined) throw new InternalError(`Key '${key.toString()}' not found in the context`);
    return value ?? null;
  }

  getFromParent<T>(key: Key, throwOnMissing: true): T;
  getFromParent<T>(key: Key, throwOnMissing?: boolean): T | null;
  getFromParent<T>(key: Key, throwOnMissing?: boolean): T | null {
    if (!this.isChildContext()) return this.get<T>(key, throwOnMissing);
    const parentStore = this.get<Map<Key, unknown>>(PARENT_CONTEXT, true);
    const value = parentStore.get(key) as T | undefined;
    if (throwOnMissing && value === undefined) throw new InternalError(`Key '${key.toString()}' not found in the parent context`);
    return value ?? null;
  }

  resolve<T>(key: Key, throwOnMissing: true): T;
  resolve<T>(key: Key, throwOnMissing?: boolean): T | null;
  resolve<T>(key: Key, throwOnMissing?: boolean): T | null {
    const isChild = this.isChildContext();
    const value = this.get<T>(key, !isChild);
    if (value !== undefined) return value;
    return this.getFromParent<T>(key, throwOnMissing);
  }

  set<T>(key: Key, value: T): this {
    const store = this.storage.getStore();
    if (!store) throw new InternalError('Context not yet initialized');
    store.set(key, value);
    return this;
  }

  setInParent<T>(key: Key, value: T): this {
    if (!this.isChildContext()) return this.set(key, value);
    const parentStore = this.get<Map<Key, unknown>>(PARENT_CONTEXT, true);
    parentStore.set(key, value);
    return this;
  }

  isChildContext(): boolean {
    const parentStore = this.get<Map<Key, unknown>>(PARENT_CONTEXT);
    return parentStore !== null;
  }

  getRequest(): HttpRequest {
    return this.resolve<HttpRequest>(REQUEST, true);
  }

  getChildRequest(): ChildRouteRequest | null {
    return this.resolve<ChildRouteRequest>(CHILD_REQUEST, false);
  }

  getResponse(): HttpResponse {
    return this.resolve<HttpResponse>(RESPONSE, true);
  }

  getRID(): string {
    return this.get<string>(RID, true);
  }
}
