import { describe, expect, it } from 'bun:test';

import { ECOSYSTEM_SEED } from '@server/modules/bootstrap/ecosystem-seed.constants';

const synapse = ECOSYSTEM_SEED.applications.find(application => application.name === 'synapse');
const permissionsOf = (role: string): readonly string[] => synapse?.roles?.find(candidate => candidate.name === role)?.permissions ?? [];

describe('ECOSYSTEM_SEED synapse', () => {
  it('should seed synapse as an internal application exposing two service-only scopes', () => {
    expect(synapse?.visibility).toBe('INTERNAL');
    expect(synapse?.resourceName).toBe('Synapse AI API');
    expect(synapse?.scopes?.map(scope => [scope.name, scope.principalType])).toEqual([
      ['synapse:infer', 'SERVICE'],
      ['synapse:catalog:read', 'SERVICE'],
    ]);
  });

  it('should declare every permission a synapse role references', () => {
    const declared = new Set(synapse?.permissions?.map(permission => permission.name));
    for (const role of synapse?.roles ?? []) {
      for (const permission of role.permissions) expect(declared.has(permission)).toBe(true);
    }
  });

  it('should layer viewer, operator and admin permissions and grant only the admin roles to the bootstrap administrator', () => {
    expect([...permissionsOf('SynapseViewer')].sort()).toEqual(['synapse:catalog:read', 'synapse:usage:read']);
    expect([...permissionsOf('SynapseOperator')].sort()).toEqual(['synapse:catalog:read', 'synapse:catalog:write', 'synapse:usage:read']);
    expect([...permissionsOf('SynapseAdmin')].sort()).toEqual([
      'synapse:budgets:write',
      'synapse:catalog:read',
      'synapse:catalog:write',
      'synapse:providers:write',
      'synapse:usage:read',
    ]);
    expect(synapse?.roles?.filter(role => role.grantToBootstrapAdmin).map(role => role.name)).toEqual(['SynapseAdmin', 'SynapseCredentialsAdmin']);
  });

  it('should no longer declare the retired catalog publish permission, since every confirmed change goes live', () => {
    expect(synapse?.permissions?.map(permission => permission.name)).not.toContain('synapse:catalog:publish');
  });

  it('should give the finance role the viewer permissions plus budget writes and nothing that changes the rest of the catalog', () => {
    expect([...permissionsOf('SynapseFinance')].sort()).toEqual(['synapse:budgets:write', 'synapse:catalog:read', 'synapse:usage:read']);
  });

  it('should keep credential management out of every catalog role and in its own role', () => {
    for (const role of ['SynapseViewer', 'SynapseOperator', 'SynapseFinance']) expect(permissionsOf(role)).not.toContain('synapse:credentials:manage');
    expect(permissionsOf('SynapseCredentialsAdmin')).toEqual(['synapse:credentials:manage']);
  });

  it('should grant novel-forge and memoir the inference and catalog scopes on api://synapse', () => {
    for (const name of ['novel-forge', 'memoir']) {
      const grants = ECOSYSTEM_SEED.applications.find(application => application.name === name)?.grants ?? [];
      expect(grants).toContainEqual({ resource: 'api://synapse', scope: 'synapse:infer' });
      expect(grants).toContainEqual({ resource: 'api://synapse', scope: 'synapse:catalog:read' });
    }
  });

  it('should allow novel-forge and memoir exactly the four inference and catalog routes', () => {
    const routes = [
      ['POST', '/api/v1/chat/completions'],
      ['POST', '/api/v1/embeddings'],
      ['POST', '/api/v1/images/generations'],
      ['GET', '/api/v1/catalog'],
    ];
    const expected = ['novel-forge', 'memoir'].flatMap(callerClientId => routes.map(([method, pathPattern]) => ({ callerClientId, method, pathPattern })));
    expect(synapse?.serviceAccess).toEqual(expected);
  });

  it('should let synapse name the editors it stores by subject id through the user directory, and grant it nothing else on the platform', () => {
    expect(synapse?.grants).toEqual([
      { resource: 'shadow-identity', scope: 'authz:check' },
      { resource: 'shadow-identity', scope: 'app-session:manage' },
      { resource: 'shadow-identity', scope: 'users:resolve' },
    ]);
  });

  it('should never use a wildcard in a synapse service-access rule', () => {
    for (const rule of synapse?.serviceAccess ?? []) expect(rule.pathPattern).not.toContain('*');
  });

  it('should declare the synapse resource before the callers that are granted its scopes', () => {
    const order = ECOSYSTEM_SEED.applications.map(application => application.name);
    expect(order.indexOf('synapse')).toBeLessThan(order.indexOf('novel-forge'));
    expect(order.indexOf('synapse')).toBeLessThan(order.indexOf('memoir'));
  });
});
