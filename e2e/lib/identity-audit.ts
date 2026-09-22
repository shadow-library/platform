/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { identityDb } from './db';

/**
 * Defining types
 */

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
}

/**
 * Declaring the constants
 *
 * Identity writes `audit_events` inside the transaction that performs the audited action, so a row is readable the
 * moment its API call answers. Every row belongs to exactly one hash chain — the organisation named on it, or the
 * global chain of rows carrying no organisation — and `prev_hash` points at the previous row of that chain alone.
 * Ids are UUIDv7, so ordering by id is write order. `detail` is stored as a JSON string inside jsonb (as the
 * notification outbox is), so it is unwrapped with `#>> '{}'` and re-parsed rather than read with `->`.
 */

/** Rows of one chain in write order — `organisationId` null is the global chain — optionally only those written after `afterId`. */
export async function auditChain(organisationId: string | null, afterId?: string): Promise<AuditRow[]> {
  return identityDb()<AuditRow[]>`
    SELECT id::text, action, outcome::text, actor_type::text AS "actorType", actor_id AS "actorId", organisation_id AS "organisationId",
           target_type AS "targetType", target_id AS "targetId", ((detail #>> '{}')::jsonb) AS detail, prev_hash AS "prevHash", hash
    FROM audit_events
    WHERE organisation_id IS NOT DISTINCT FROM ${organisationId} AND (${afterId ?? null}::uuid IS NULL OR id > ${afterId ?? null}::uuid)
    ORDER BY id
  `;
}

/** The newest row of a chain, or `undefined` when nothing has been written to it yet. */
export async function auditChainTip(organisationId: string | null): Promise<AuditChainTip | undefined> {
  const [row] = await identityDb()<AuditChainTip[]>`
    SELECT id::text, hash FROM audit_events WHERE organisation_id IS NOT DISTINCT FROM ${organisationId} ORDER BY id DESC LIMIT 1
  `;
  return row;
}

/** How many rows start a chain (`prev_hash IS NULL`) — exactly one while the chain is intact. */
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
