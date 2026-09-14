import { describe, expect, it } from 'bun:test';

import { assertValidRoleCatalog, type RoleManifest } from '@shadow-library/auth';

import { CURATE_PERMISSION, GENERATION_RUN_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';
import { NOVEL_FORGE_ROLE_CATALOG } from '@modules/auth/role-catalog.constants';

const roleNamed = (name: string): RoleManifest => NOVEL_FORGE_ROLE_CATALOG.roles.find(role => role.name === name) as RoleManifest;

/**
 * Identity re-runs every one of these checks at the trust boundary and answers `AUTHZ_001`, so a manifest
 * that fails here fails the boot of every deployment rather than one test.
 */
describe('novel forge role catalog', () => {
  it('should satisfy the SDK and identity bot-grant rules', () => {
    expect(() => assertValidRoleCatalog(NOVEL_FORGE_ROLE_CATALOG)).not.toThrow();
  });

  it('should declare unique permission and role names', () => {
    const permissions = NOVEL_FORGE_ROLE_CATALOG.permissions.map(permission => permission.name);
    const roles = NOVEL_FORGE_ROLE_CATALOG.roles.map(role => role.name);
    expect(new Set(permissions).size).toBe(permissions.length);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('should grant only permissions the manifest itself declares', () => {
    const declared = new Set(NOVEL_FORGE_ROLE_CATALOG.permissions.map(permission => permission.name));
    for (const role of NOVEL_FORGE_ROLE_CATALOG.roles) for (const permission of role.permissions) expect(declared).toContain(permission);
  });

  it('should carry every permission every route can demand', () => {
    const declared = NOVEL_FORGE_ROLE_CATALOG.permissions.map(permission => permission.name);
    expect(declared).toEqual([PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, GENERATION_RUN_PERMISSION, CURATE_PERMISSION]);
  });

  it('should make exactly one role default and give it the everyday permissions', () => {
    const defaults = NOVEL_FORGE_ROLE_CATALOG.roles.filter(role => role.default);
    expect(defaults.map(role => role.name)).toEqual(['NovelForgeAuthor']);
    expect(defaults[0]?.permissions).toEqual([PROJECTS_READ_PERMISSION, PROJECTS_WRITE_PERMISSION, ILLUSTRATIONS_WRITE_PERMISSION, GENERATION_RUN_PERMISSION]);
    expect(defaults[0]?.bot).toBeUndefined();
  });

  it('should expose one bot-grantable role per resource and level', () => {
    const grants = NOVEL_FORGE_ROLE_CATALOG.roles.filter(role => role.bot).map(role => `${role.bot?.resource}:${role.bot?.level}`);
    expect(grants.sort()).toEqual(['curated-ingest:write', 'generation:write', 'illustrations:write', 'projects:read', 'projects:write'].sort());
    expect(new Set(grants).size).toBe(grants.length);
  });

  it('should give every bot-grantable role at least one permission', () => {
    for (const role of NOVEL_FORGE_ROLE_CATALOG.roles) if (role.bot) expect(role.permissions.length).toBeGreaterThan(0);
  });

  it('should make the projects write role a superset of the read role', () => {
    const reader = roleNamed('NovelForgeProjectsReader');
    const writer = roleNamed('NovelForgeProjectsWriter');
    for (const permission of reader.permissions) expect(writer.permissions).toContain(permission);
  });

  it('should flag only AI generation as a sensitive bot grant', () => {
    const sensitive = NOVEL_FORGE_ROLE_CATALOG.roles.filter(role => role.bot?.sensitive).map(role => role.name);
    expect(sensitive).toEqual(['NovelForgeGenerator']);
  });

  it('should keep the curator role bot-grantable and outside the default role', () => {
    expect(roleNamed('NovelForgeCurator').bot).toEqual({ resource: 'curated-ingest', level: 'write' });
    expect(roleNamed('NovelForgeAuthor').permissions).not.toContain(CURATE_PERMISSION);
  });
});
