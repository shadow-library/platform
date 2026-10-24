import { describe, expect, it } from 'bun:test';

import { AUTH_ROUTE_METADATA, type RequiredAuthRoute } from '@shadow-library/auth/module';

import { AccessController } from '@modules/admin/access.controller';
import { BudgetsController } from '@modules/admin/budgets.controller';
import { CatalogAdminController } from '@modules/admin/catalog-admin.controller';
import { CatalogController } from '@modules/admin/catalog.controller';
import { CredentialsController } from '@modules/admin/credentials.controller';
import { ProvidersController } from '@modules/admin/providers.controller';
import { UsageController } from '@modules/admin/usage.controller';

interface DeclaredRoute {
  route: string;
  auth: RequiredAuthRoute | undefined;
}

const CONTROLLERS = [AccessController, CatalogController, CatalogAdminController, UsageController, ProvidersController, CredentialsController, BudgetsController];

function basePath(controller: object): string {
  for (const key of Reflect.getMetadataKeys(controller)) {
    const path = (Reflect.getMetadata(key, controller) as { path?: unknown } | undefined)?.path;
    if (typeof path === 'string') return path;
  }
  return '';
}

function declaredRoutes(): DeclaredRoute[] {
  const routes: DeclaredRoute[] = [];
  for (const controller of CONTROLLERS) {
    const base = basePath(controller);
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = (controller.prototype as unknown as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      for (const key of Reflect.getMetadataKeys(handler)) {
        const metadata = Reflect.getMetadata(key, handler) as Record<string | symbol, unknown> | undefined;
        if (metadata?.method === undefined) continue;
        routes.push({ route: `${String(metadata.method)} ${base}${String(metadata.path ?? '')}`, auth: metadata[AUTH_ROUTE_METADATA] as RequiredAuthRoute | undefined });
      }
    }
  }
  return routes;
}

const PERMISSIONS: Record<string, string> = {
  'GET /api/v1/admin/catalog/versions': 'synapse:catalog:read',
  'GET /api/v1/admin/catalog/versions/:version': 'synapse:catalog:read',
  'GET /api/v1/admin/catalog/draft': 'synapse:catalog:read',
  'PUT /api/v1/admin/catalog/draft': 'synapse:catalog:write',
  'POST /api/v1/admin/catalog/draft/validate': 'synapse:catalog:write',
  'GET /api/v1/admin/catalog/draft/diff': 'synapse:catalog:read',
  'POST /api/v1/admin/catalog/draft/publish': 'synapse:catalog:publish',
  'POST /api/v1/admin/catalog/versions/:version/rollback': 'synapse:catalog:publish',
  'GET /api/v1/admin/catalog/aliases/:key/impact': 'synapse:catalog:read',
  'GET /api/v1/admin/usage': 'synapse:usage:read',
  'GET /api/v1/admin/usage/series': 'synapse:usage:read',
  'GET /api/v1/admin/budgets/status': 'synapse:usage:read',
  'GET /api/v1/admin/providers': 'synapse:catalog:read',
};

const CREDENTIAL_ROUTES = [
  'GET /api/v1/admin/credentials',
  'POST /api/v1/admin/credentials',
  'GET /api/v1/admin/credentials/status/keyring',
  'GET /api/v1/admin/credentials/:id',
  'PUT /api/v1/admin/credentials/:id/secret',
  'POST /api/v1/admin/credentials/:id/test',
  'DELETE /api/v1/admin/credentials/:id',
];

describe('admin route auth metadata', () => {
  const routes = declaredRoutes();

  it('should discover every route', () => {
    expect(routes).toHaveLength(Object.keys(PERMISSIONS).length + CREDENTIAL_ROUTES.length + 2);
  });

  it('should require exactly the documented permission on each admin route', () => {
    for (const [route, permission] of Object.entries(PERMISSIONS)) {
      const declared = routes.find(candidate => candidate.route === route);
      expect(declared?.auth).toMatchObject({ access: 'required', permission });
      expect(declared?.auth?.scopes).toBeUndefined();
    }
  });

  it('should require credential management, checked against the short high-risk cache, on every credential route', () => {
    for (const route of CREDENTIAL_ROUTES) {
      const declared = routes.find(candidate => candidate.route === route);
      expect({ route, auth: declared?.auth }).toMatchObject({ route, auth: { access: 'required', permission: 'synapse:credentials:manage', highRisk: true } });
    }
  });

  it('should require the catalog read scope, and no permission, on the service catalog route', () => {
    const declared = routes.find(candidate => candidate.route === 'GET /api/v1/catalog');

    expect(declared?.auth).toMatchObject({ access: 'required', scopes: ['synapse:catalog:read'] });
    expect(declared?.auth?.permission).toBeUndefined();
  });

  it('should require a session, and no permission, on the route that reports what the user may do', () => {
    const declared = routes.find(candidate => candidate.route === 'GET /api/v1/admin/access');

    expect(declared?.auth).toMatchObject({ access: 'required' });
    expect(declared?.auth?.permission).toBeUndefined();
    expect(declared?.auth?.scopes).toBeUndefined();
  });

  it('should leave no route without a declared access policy', () => {
    for (const route of routes) expect(route.auth?.access).toBe('required');
  });
});
