import { describe, expect, it } from 'bun:test';
import { type HandlerMetadata } from '@shadow-library/app';
import { type AuthAccessMode } from '@shadow-library/auth';
import { AUTH_ROUTE_METADATA, type AuthRouteAccess, resolveRoutePolicy } from '@shadow-library/auth/module';

import { PUBLISH_SCOPE } from '@server/constants';
import { FEATURE_MODULES } from '@server/routes/feature-modules';

interface Route {
  name: string;
  metadata: HandlerMetadata;
}

type Controller = abstract new (...args: never[]) => unknown;

const EXPECTED_ACCESS: Record<string, Record<AuthAccessMode, AuthRouteAccess>> = {
  HealthController: { public: 'public', private: 'public' },
  CatalogController: { public: 'optional', private: 'required' },
  WikiController: { public: 'optional', private: 'required' },
  ReaderController: { public: 'required', private: 'required' },
  PublishController: { public: 'required', private: 'required' },
  WikiIngestController: { public: 'required', private: 'required' },
};

const INTERNAL_CONTROLLERS = new Set(['PublishController', 'WikiIngestController']);

/** The framework keys its metadata by unexported symbols, so they are found by description */
function frameworkMetadata<T>(target: object, description: string): T | undefined {
  const key = Reflect.getMetadataKeys(target).find(candidate => typeof candidate === 'symbol' && candidate.description === description);
  return key === undefined ? undefined : (Reflect.getMetadata(key, target) as T);
}

/**
 * Approximates the router's deep merge of a method's handler metadata over its class's: the auth entry is
 * merged shallowly, so class and method arrays such as `scopes` replace rather than concatenate, and only
 * the controller's own prototype is walked. Neither matters while no controller here inherits handlers or
 * repeats a requirement at both levels.
 */
function routesOf(controller: Controller): Route[] {
  const classMetadata = frameworkMetadata<HandlerMetadata>(controller, 'handler-metadata') ?? {};
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype).flatMap(name => {
    const method = prototype[name];
    const methodMetadata = name === 'constructor' || typeof method !== 'function' ? undefined : frameworkMetadata<HandlerMetadata>(method, 'handler-metadata');
    if (!methodMetadata) return [];
    const auth = { ...classMetadata[AUTH_ROUTE_METADATA], ...methodMetadata[AUTH_ROUTE_METADATA] } as Record<string, unknown>;
    const metadata = { ...classMetadata, ...methodMetadata, ...(Object.keys(auth).length > 0 && { [AUTH_ROUTE_METADATA]: auth }) };
    return [{ name: `${controller.name}.${name}`, metadata }];
  });
}

const controllers = FEATURE_MODULES.flatMap(module => frameworkMetadata<{ controllers?: Controller[] }>(module, 'module-metadata')?.controllers ?? []).filter(
  controller => routesOf(controller).length > 0,
);

describe('web-novel route policy', () => {
  it('should declare an expected access for every controller the feature modules register', () => {
    expect(controllers.map(controller => controller.name).sort()).toEqual(Object.keys(EXPECTED_ACCESS).sort());
  });

  for (const mode of ['public', 'private'] as const) {
    for (const controller of controllers) {
      for (const route of routesOf(controller)) {
        const expected = EXPECTED_ACCESS[controller.name]?.[mode];

        it(`should serve ${route.name} as ${expected} in ${mode} mode`, () => {
          const policy = resolveRoutePolicy(route.metadata, mode);

          expect(policy.access).toBe(expected as AuthRouteAccess);
          if (INTERNAL_CONTROLLERS.has(controller.name)) expect(policy).toMatchObject({ scopes: [PUBLISH_SCOPE] });
        });
      }
    }
  }
});
