import { inArray } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { IdentityProviderService } from '@server/modules/auth/federation';
import { DatabaseService, IdentityProvider, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { AUTH_MODE_REGISTRY, AUTH_MODES, AuthMode, AuthModeDefinition, isAuthMode } from './auth-mode.registry';

export interface AuthModeDescriptor {
  method: AuthMode;
  label: string;
  description: string;
  kind: AuthModeDefinition['kind'];
  enabled: boolean;
  /** A social method with no upstream credentials cannot be turned on; a built-in one is always considered configured. */
  configured: boolean;
  provider: IdentityProvider | null;
}

const CACHE_KEY = 'auth_modes';
const CACHE_TTL_S = 300;

@Injectable()
export class AuthModeService {
  private readonly logger = Logger.getLogger(APP_NAME, AuthModeService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(
    databaseService: DatabaseService,
    private readonly identityProviderService: IdentityProviderService,
  ) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  async isEnabled(mode: AuthMode): Promise<boolean> {
    const definition = AUTH_MODE_REGISTRY[mode] as AuthModeDefinition;
    if (definition.kind === 'BUILT_IN') {
      const overrides = await this.readOverrides();
      return overrides[mode] ?? definition.defaultEnabled;
    }
    const provider = definition.providerKind ? await this.identityProviderService.getGlobal(definition.providerKind) : null;
    return Boolean(provider?.isActive);
  }

  async list(): Promise<AuthModeDescriptor[]> {
    const [overrides, providers] = await Promise.all([this.readOverrides(), this.identityProviderService.listGlobal()]);
    const byKind = new Map(providers.map(provider => [provider.kind, provider]));

    return AUTH_MODES.map(mode => {
      const definition = AUTH_MODE_REGISTRY[mode] as AuthModeDefinition;
      const provider = definition.providerKind ? (byKind.get(definition.providerKind) ?? null) : null;
      const enabled = definition.kind === 'SOCIAL' ? Boolean(provider?.isActive) : (overrides[mode] ?? definition.defaultEnabled);
      return {
        method: mode,
        label: definition.label,
        description: definition.description,
        kind: definition.kind,
        enabled,
        configured: definition.kind === 'BUILT_IN' || provider !== null,
        provider,
      };
    });
  }

  /**
   * A social method has no switch of its own: enabling it activates the provider row that holds its
   * credentials, so a method whose settings were never supplied is refused rather than silently stored.
   */
  async setEnabled(mode: AuthMode, enabled: boolean, updatedBy: bigint): Promise<void> {
    const definition = AUTH_MODE_REGISTRY[mode] as AuthModeDefinition;
    if (definition.kind === 'SOCIAL') {
      const provider = definition.providerKind ? await this.identityProviderService.getGlobal(definition.providerKind) : null;
      if (!provider) throw AppErrorCode.FED_004.create();
      await this.identityProviderService.updateGlobal(provider.id, { isActive: enabled });
    } else {
      await this.db
        .insert(schema.authModeSettings)
        .values({ method: mode, isEnabled: enabled, updatedBy })
        .onConflictDoUpdate({ target: schema.authModeSettings.method, set: { isEnabled: enabled, updatedBy, updatedAt: new Date() } });
    }

    await this.invalidate();
    this.logger.info('auth mode updated', { method: mode, enabled });
  }

  async invalidate(): Promise<void> {
    await this.redis.del(CACHE_KEY);
  }

  private async readOverrides(): Promise<Partial<Record<AuthMode, boolean>>> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Partial<Record<AuthMode, boolean>>;

    const rows = await this.db
      .select({ method: schema.authModeSettings.method, isEnabled: schema.authModeSettings.isEnabled })
      .from(schema.authModeSettings)
      .where(inArray(schema.authModeSettings.method, AUTH_MODES));

    const overrides: Partial<Record<AuthMode, boolean>> = {};
    for (const row of rows) {
      if (isAuthMode(row.method)) overrides[row.method] = row.isEnabled;
    }
    await this.redis.set(CACHE_KEY, JSON.stringify(overrides), 'EX', CACHE_TTL_S);
    return overrides;
  }
}
