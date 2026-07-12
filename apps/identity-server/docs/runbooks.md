# Operational Runbooks

Evidence-based procedures for operating the identity platform. Every step references behaviour that
exists in this repository today; where an admin API is still pending (M6), the interim procedure is
stated explicitly.

Targets (architecture §15): **RPO ≤ 5 min, RTO ≤ 1 h**, single region.

## 1. Signing-key rotation (routine)

Signing keys live in `signing_keys`, envelope-encrypted with `SECURITY_MASTER_ENCRYPTION_KEY`
(AES-256-GCM), and move through `PENDING → ACTIVE → RETIRING → RETIRED`. Verification honours
retiring keys, so rotation is zero-downtime.

1. Run the rotation from a maintenance shell on any API instance (admin API lands with M6):
   `bun -e "const {ShadowFactory}=await import('@shadow-library/app'); const {AppModule}=await import('./src/app.module.ts'); const {KeyService}=await import('./src/modules/auth/keys/index.ts'); const app=await ShadowFactory.create(AppModule); await app.get(KeyService).rotate(); await app.stop();"`
2. Confirm the new `kid` appears in `GET /.well-known/jwks.json` alongside the retiring key.
3. Access tokens are ≤ 10 min (client `access_token_ttl`, default 600 s); after that window run
   `KeyService.retireExpiredKeys(cutoff)` or let the maintenance loop do so.
4. Verify issuance: request a client-credentials token and check its header `kid` is the new key.

## 2. Signing-key compromise (incident)

1. Rotate immediately (runbook §1) — the compromised key stops signing at once.
2. Retire the compromised key without a grace window: `KeyService.retireExpiredKeys(new Date())`.
   JWKS stops publishing it; all tokens it signed fail verification from this moment.
3. Revoke refresh-token families and sessions issued during the exposure window (SQL):
   `UPDATE refresh_token_families SET status='REVOKED', revoke_reason='ADMIN', revoked_at=now() WHERE status='ACTIVE' AND created_at > '<exposure start>';`
   `UPDATE user_sessions SET status='REVOKED', terminated_at=now() WHERE status='ACTIVE' AND created_at > '<exposure start>';`
   then flush the session cache: `redis-cli --scan --pattern 'session:*' | xargs redis-cli del`.
4. If `SECURITY_MASTER_ENCRYPTION_KEY` itself leaked, generate a new one, re-encrypt stored private keys
   (decrypt with old, encrypt with new — maintenance script), redeploy, then rotate per §1.
5. Preserve the audit trail: key changes are audited; do not truncate `audit_events`.

## 3. Database restore / DR drill (quarterly)

Backups: nightly logical dumps plus WAL archiving (platform tooling). To restore:

1. Provision a fresh Postgres, restore the latest base backup, replay WAL to the target time.
2. Point a staging instance at it: set `DATABASE_POSTGRES_URL`, boot, and confirm
   `GET /health/ready` reports ready (checks Postgres, Redis, and an active signing key).
3. Run `bun run db:migrate` — it must be a no-op for a healthy backup; a diff signals schema drift.
4. Integrity checks:
   - Audit chain: recompute `hash = SHA-256(prev_hash || canonical_row)` per organisation over
     `audit_events` and compare (chain fields: `previous_hash`, `hash`).
   - Sanity counts: `users`, `user_sessions` (ACTIVE), `refresh_token_families` (ACTIVE).
5. Redis is a cache and coordination layer only — it is NOT restored. Sessions revalidate against
   Postgres on first miss; rate-limit counters restart empty (fails open by design).
6. Record drill duration against the RTO ≤ 1 h target.

## 4. Refresh-token reuse detected (automatic + follow-up)

The server already handles the mechanics: reuse of a rotated refresh token revokes the whole
family and its session, writes a `security.token_reuse` audit event, and logs a warning tagged
`securityEvent: security.token_reuse`.

Operator follow-up:

1. Locate the event: `SELECT * FROM audit_events WHERE action='security.token_reuse' ORDER BY occurred_at DESC;`
2. Review the user's recent `user_sign_in_events` and `security.new_device_login` audit entries
   for the same window; correlate source IPs.
3. If compromise is likely: terminate all sessions (`SessionService.terminateAllForUser`, or the
   SQL in §2 scoped to the user), and lock the account to OTP-only:
   `UPDATE users SET lock_mode='OTP_ONLY', locked_until=now() + interval '24 hours' WHERE id=<user>;`
4. The user was NOT notified automatically for reuse — send comms if warranted.

## 5. IP block management

Automatic: ≥ 30 failed logins from one IP within 15 min blocks it for 1 h
(`security.ip_blocked` audit event; enforcement in the rate-limit middleware).

- Inspect: `redis-cli keys 'rl:ipblock:*'` / `redis-cli ttl 'rl:ipblock:<ip>'`
- Manual block: `redis-cli set 'rl:ipblock:<ip>' 1 EX 3600`
- Unblock: `redis-cli del 'rl:ipblock:<ip>'`
- Permanent bypass (load balancers, health probes): add the IP to `RATE_LIMIT_IP_ALLOWLIST`
  (comma-separated) and restart.
- Kill switch: `RATE_LIMIT_ENABLED=false` disables all budgets (emergency only — auth endpoints
  otherwise fail closed when Redis is down).

## 6. Bootstrap and break-glass access

On every boot the server idempotently provisions the platform application, the `IAMAdmin` role,
the `authz:check` scope, and a bootstrap administrator (`AUTH_BOOTSTRAP_ADMIN_EMAIL`,
default `admin@shadow-apps.com`).

- If `AUTH_BOOTSTRAP_ADMIN_PASSWORD` is unset, a random password is generated and logged
  exactly once at boot (`Generated bootstrap admin password`); rotate it immediately after use.
- Lost admin access: recover via `POST /api/v1/auth/recover/init` against the admin email (OTP to
  the verified address), or set a new `AUTH_BOOTSTRAP_ADMIN_PASSWORD`, delete the admin's
  password credential row, and reboot — `ensureBootstrapAdmin` only creates missing users, so
  prefer the recovery flow.

## 7. Notification outbox operations

The worker (single instance; `worker.js` from the same image) drains `notification_outbox` and
pushes to pulse-server.

- Interrupted deliveries: rows stuck in `SENDING` are requeued automatically at worker boot
  (`recoverStuckDeliveries`); mid-flight duplicates are possible after a crash — templates must
  stay idempotent for recipients.
- Dead letters (≥ 5 attempts): inspect `SELECT * FROM notification_outbox WHERE status='DEAD';`
  and requeue after fixing the cause:
  `UPDATE notification_outbox SET status='FAILED', attempt_count=0, next_attempt_at=now() WHERE status='DEAD';`
- Backlog metric: count of `PENDING`/`FAILED` rows with `next_attempt_at <= now()`.

## 8. Graceful shutdown and deploys

- Both processes install SIGINT/SIGTERM hooks (framework `enableShutdownHooks`): HTTP drains via
  fastify close, `DatabaseModule` closes Postgres/Redis, and the worker stops its timer then
  awaits the in-flight tick before exiting.
- Deploy order: migrate (expand-only) → roll API instances → roll the single worker. Contract
  migrations only after all instances run the new code.
- Readiness: gate traffic on `GET /health/ready`; liveness on `GET /health` (container
  `HEALTHCHECK` uses liveness).
