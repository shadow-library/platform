import { identityDb } from './db';

export interface AuditRow {
  id: string;
  action: string;
  outcome: string;
  actorType: string;
  actorId: string | null;
  organisationId: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  prevHash: string | null;
  hash: string;
}

/** Where a chain stood before an action ran, so a spec can read exactly the rows that action appended. */
export interface AuditChainTip {
  id: string;
  hash: string;
  chainPosition: string | null;
}

/**
 * `audit_events` rows are written in the audited action's transaction, so they are readable as soon as the API call answers. Each row belongs to one hash chain
 * (its organisation, or the global chain when it carries none) and `prev_hash` points at the previous row of that chain alone.
 * `chain_position` is write order; ids are UUIDv7, not monotonic within a millisecond, so only rows predating positions (null, chained in id order) sort by id.
 * `detail` is a JSON string inside jsonb, so it is unwrapped with `#>> '{}'` and re-parsed rather than read with `->`.
 */

export async function auditChain(organisationId: string | null, afterId?: string): Promise<AuditRow[]> {
  const after = afterId ?? null;
  return identityDb()<AuditRow[]>`
    SELECT id::text, action, outcome::text, actor_type::text AS "actorType", actor_id AS "actorId", organisation_id AS "organisationId",
           target_type AS "targetType", target_id AS "targetId", ((detail #>> '{}')::jsonb) AS detail, prev_hash AS "prevHash", hash
    FROM audit_events
    WHERE organisation_id IS NOT DISTINCT FROM ${organisationId}
      AND (${after}::uuid IS NULL OR chain_position > coalesce((SELECT chain_position FROM audit_events WHERE id = ${after}::uuid), 0))
    ORDER BY chain_position NULLS FIRST, id
  `;
}

export async function auditChainTip(organisationId: string | null): Promise<AuditChainTip | undefined> {
  const [row] = await identityDb()<AuditChainTip[]>`
    SELECT id::text, hash, chain_position::text AS "chainPosition" FROM audit_events
    WHERE organisation_id IS NOT DISTINCT FROM ${organisationId}
    ORDER BY chain_position DESC NULLS LAST, id DESC LIMIT 1
  `;
  return row;
}

export async function countAuditChainRoots(organisationId: string | null): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM audit_events WHERE organisation_id IS NOT DISTINCT FROM ${organisationId} AND prev_hash IS NULL
  `;
  return row?.count ?? 0;
}

export async function findAuditEvents(action: string, targetId: string): Promise<AuditRow[]> {
  return identityDb()<AuditRow[]>`
    SELECT id::text, action, outcome::text, actor_type::text AS "actorType", actor_id AS "actorId", organisation_id AS "organisationId",
           target_type AS "targetType", target_id AS "targetId", ((detail #>> '{}')::jsonb) AS detail, prev_hash AS "prevHash", hash
    FROM audit_events WHERE action = ${action} AND target_id = ${targetId} ORDER BY id
  `;
}

export async function findAuditEventsByIp(action: string, ipAddress: string): Promise<AuditRow[]> {
  return identityDb()<AuditRow[]>`
    SELECT id::text, action, outcome::text, actor_type::text AS "actorType", actor_id AS "actorId", organisation_id AS "organisationId",
           target_type AS "targetType", target_id AS "targetId", ((detail #>> '{}')::jsonb) AS detail, prev_hash AS "prevHash", hash
    FROM audit_events WHERE action = ${action} AND ip_address = ${ipAddress} ORDER BY id
  `;
}

export async function findAuditEventsByActor(action: string, actorId: string): Promise<AuditRow[]> {
  return identityDb()<AuditRow[]>`
    SELECT id::text, action, outcome::text, actor_type::text AS "actorType", actor_id AS "actorId", organisation_id AS "organisationId",
           target_type AS "targetType", target_id AS "targetId", ((detail #>> '{}')::jsonb) AS detail, prev_hash AS "prevHash", hash
    FROM audit_events WHERE action = ${action} AND actor_id = ${actorId} ORDER BY id
  `;
}
