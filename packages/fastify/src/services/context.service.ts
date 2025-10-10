/**
 * Importing npm packages
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@shadow-library/app';
import { InternalError } from '@shadow-library/common';
import { onRequestHookHandler } from 'fastify';

/**
 * Importing user defined packages
 */
import { HttpRequest, HttpResponse } from '../interfaces';

/**
 * Defining types
 */

type Key = string | symbol;

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
export interface ContextExtension {}

/**
 * Declaring the constants
 */
const REQUEST = Symbol('request');
const RESPONSE = Symbol('response');
const RID = Symbol('rid');
const PARENT_CONTEXT = Symbol('parent-context');
const CHILD_RID_COUNTER = Symbol('child-rid-counter');

@Injectable()
export class ContextService implements ContextExtension {
  static readonly name = 'ContextService';

  private readonly storage = new AsyncLocalStorage<Map<Key, unknown>>();

  init(): onRequestHookHandler {
    return (req, res, done) => {
      const parentStore = this.storage.getStore();
      const store = new Map<Key, unknown>();

      if (parentStore) {
        const isChildContext = parentStore.has(PARENT_CONTEXT);
        if (isChildContext) throw new InternalError('Cannot create a child context within an existing child context');

        const childRIDCounter = (this.get<number>(CHILD_RID_COUNTER) ?? 0) + 1;
        this.set(CHILD_RID_COUNTER, childRIDCounter);
        req.id = `${this.getRID()}-${childRIDCounter}`;
        store.set(PARENT_CONTEXT, parentStore);
      }

      store.set(REQUEST, req);
      store.set(RESPONSE, res);
      store.set(RID, req.id);
      this.storage.run(store, done);
    };
  }

  isInitialized(): boolean {
    return this.storage.getStore() !== undefined;
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
    if (value !== null || !isChild) return value;
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

  getRequest(): HttpRequest;
  getRequest(throwOnMissing: false): HttpRequest | null;
  getRequest(throwOnMissing = true): HttpRequest | null {
    return this.get<HttpRequest>(REQUEST, throwOnMissing);
  }

  getResponse(): HttpResponse;
  getResponse(throwOnMissing: false): HttpResponse | null;
  getResponse(throwOnMissing = true): HttpResponse | null {
    return this.get<HttpResponse>(RESPONSE, throwOnMissing);
  }

  getRID(): string;
  getRID(throwOnMissing: false): string | null;
  getRID(throwOnMissing = true): string | null {
    return this.get<string>(RID, throwOnMissing);
  }

  extend<T extends ContextExtension = ContextExtension>(extension: T & ThisType<this & T>): this {
    return Object.assign(this, extension);
  }
}
