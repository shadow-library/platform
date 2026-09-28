import { describe, expect, it } from 'bun:test';

import { AUTH_ROUTE_METADATA, type AuthRouteMetadata } from '@shadow-library/auth/module';

import { GenerationController } from '@modules/generation/generation.controller';
import { GENERATION_RUN_PERMISSION, PROJECTS_WRITE_PERMISSION } from '@server/constants';

function botPermissionsOf(handler: object): string[] {
  for (const key of Reflect.getMetadataKeys(handler)) {
    const metadata = Reflect.getMetadata(key, handler) as Record<string, AuthRouteMetadata | undefined> | undefined;
    const auth = metadata?.[AUTH_ROUTE_METADATA];
    if (auth) return auth.botPermissions ?? [];
  }
  return [];
}

describe('GenerationController', () => {
  it('should require projects:write from a bot on summarize, since it saves the summary', () => {
    const permissions = botPermissionsOf(GenerationController.prototype.summarizeChapter);

    expect(permissions).toContain(GENERATION_RUN_PERMISSION);
    expect(permissions).toContain(PROJECTS_WRITE_PERMISSION);
  });
});
