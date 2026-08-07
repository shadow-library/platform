import { and, eq, inArray } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

import { isPolicyKey, POLICY_KEYS, POLICY_REGISTRY, PolicyDefinition, PolicyKey, PolicyValue } from './policy.registry';

export interface PolicyScope {
  organisationIds?: (bigint | null | undefined)[];
  clientValue?: number | null;
}

export interface PolicyDescriptor {
  key: PolicyKey;
  label: string;
  description: string;
  type: PolicyDefinition['type'];
  defaultValue: number | boolean;
  min?: number;
  max?: number;
  effectiveValue: number | boolean;
  configuredValue: number | boolean | null;
}

const CACHE_TTL_S = 300;

@Injectable()
export class PolicyService {
  private readonly logger = Logger.getLogger(APP_NAME, PolicyService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  private cacheKey(organisationId: bigint): string {
    return `org_policy:${organisationId}`;
  }

  async resolve<K extends PolicyKey>(key: K, scope: PolicyScope = {}): Promise<PolicyValue<K>> {
    const definition = POLICY_REGISTRY[key] as PolicyDefinition;
    const organisationIds = [...new Set((scope.organisationIds ?? []).filter((id): id is bigint => typeof id === 'bigint'))];
    const overrides = await Promise.all(organisationIds.map(id => this.readOverride(id, key)));
    const candidates = [definition.default, scope.clientValue, ...overrides].filter((value): value is number | boolean => value !== null && value !== undefined);
    return this.clamp(definition, this.fold(definition, candidates)) as PolicyValue<K>;
  }

  async resolveAll<K extends PolicyKey>(keys: readonly K[], scope: PolicyScope = {}): Promise<Record<K, PolicyValue<K>>> {
    const entries = await Promise.all(keys.map(async key => [key, await this.resolve(key, scope)] as const));
    return Object.fromEntries(entries) as Record<K, PolicyValue<K>>;
  }

  selectValue<K extends PolicyKey>(key: K, wire: { value?: number; enabled?: boolean }): PolicyValue<K> {
    this.assertKnown(key);
    const definition = POLICY_REGISTRY[key] as PolicyDefinition;
    const value = definition.type === 'boolean' ? wire.enabled : wire.value;
    if (value === undefined) throw AppErrorCode.POL_002.create();
    return value as PolicyValue<K>;
  }

  async set<K extends PolicyKey>(organisationId: bigint, key: K, value: PolicyValue<K>, updatedBy?: bigint): Promise<void> {
    this.assertValid(key, value);
    await this.db
      .insert(schema.organisationPolicies)
      .values({ organisationId, policyKey: key, policyValue: value, updatedBy: updatedBy ?? null })
      .onConflictDoUpdate({
        target: [schema.organisationPolicies.organisationId, schema.organisationPolicies.policyKey],
        set: { policyValue: value, updatedBy: updatedBy ?? null, updatedAt: new Date() },
      });
    await this.invalidate(organisationId);
    this.logger.info('organisation policy updated', { organisationId, policyKey: key, value });
  }

  async clear(organisationId: bigint, key: PolicyKey): Promise<void> {
    this.assertKnown(key);
    await this.db.delete(schema.organisationPolicies).where(and(eq(schema.organisationPolicies.organisationId, organisationId), eq(schema.organisationPolicies.policyKey, key)));
    await this.invalidate(organisationId);
    this.logger.info('organisation policy cleared', { organisationId, policyKey: key });
  }

  async listForOrganisation(organisationId: bigint): Promise<PolicyDescriptor[]> {
    const configured = await this.readAll(organisationId);
    return Promise.all(
      POLICY_KEYS.map(async key => {
        const definition = POLICY_REGISTRY[key] as PolicyDefinition;
        return {
          key,
          label: definition.label,
          description: definition.description,
          type: definition.type,
          defaultValue: definition.default,
          min: definition.min,
          max: definition.max,
          effectiveValue: await this.resolve(key, { organisationIds: [organisationId] }),
          configuredValue: configured[key] ?? null,
        };
      }),
    );
  }

  private async readOverride(organisationId: bigint, key: PolicyKey): Promise<number | boolean | null> {
    const all = await this.readAll(organisationId);
    return all[key] ?? null;
  }

  private async readAll(organisationId: bigint): Promise<Partial<Record<PolicyKey, number | boolean>>> {
    const cached = await this.redis.get(this.cacheKey(organisationId));
    if (cached) return JSON.parse(cached) as Partial<Record<PolicyKey, number | boolean>>;

    const rows = await this.db
      .select({ policyKey: schema.organisationPolicies.policyKey, policyValue: schema.organisationPolicies.policyValue })
      .from(schema.organisationPolicies)
      .where(and(eq(schema.organisationPolicies.organisationId, organisationId), inArray(schema.organisationPolicies.policyKey, POLICY_KEYS)));

    const overrides: Partial<Record<PolicyKey, number | boolean>> = {};
    for (const row of rows) {
      if (isPolicyKey(row.policyKey)) overrides[row.policyKey] = row.policyValue as number | boolean;
    }
    await this.redis.set(this.cacheKey(organisationId), JSON.stringify(overrides), 'EX', CACHE_TTL_S);
    return overrides;
  }

  private async invalidate(organisationId: bigint): Promise<void> {
    await this.redis.del(this.cacheKey(organisationId));
  }

  private fold(definition: PolicyDefinition, candidates: (number | boolean)[]): number | boolean {
    if (candidates.length === 1) return candidates[0] as number | boolean;
    switch (definition.resolution) {
      case 'MIN':
        return Math.min(...(candidates as number[]));
      case 'MAX':
        return Math.max(...(candidates as number[]));
      case 'AND':
        return (candidates as boolean[]).every(Boolean);
      case 'OR':
        return (candidates as boolean[]).some(Boolean);
      case 'OVERRIDE':
        return candidates[candidates.length - 1] as number | boolean;
    }
  }

  private clamp(definition: PolicyDefinition, value: number | boolean): number | boolean {
    if (typeof value !== 'number') return value;
    const lowerBounded = definition.min === undefined ? value : Math.max(definition.min, value);
    return definition.max === undefined ? lowerBounded : Math.min(definition.max, lowerBounded);
  }

  private assertKnown(key: string): asserts key is PolicyKey {
    if (!isPolicyKey(key)) throw AppErrorCode.POL_001.create();
  }

  private assertValid(key: string, value: unknown): void {
    this.assertKnown(key);
    const definition = POLICY_REGISTRY[key] as PolicyDefinition;
    if (definition.type === 'boolean' && typeof value !== 'boolean') throw AppErrorCode.POL_002.create();
    if (definition.type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) throw AppErrorCode.POL_002.create();
      if (definition.min !== undefined && value < definition.min) throw AppErrorCode.POL_002.create();
      if (definition.max !== undefined && value > definition.max) throw AppErrorCode.POL_002.create();
    }
  }
}
