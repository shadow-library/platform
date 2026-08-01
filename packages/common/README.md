# @shadow-library/common

Foundation package (config, logging, errors, caching, HTTP client, task/flow orchestration, utils) for every
Shadow Library backend. Full API surface: `.claude/skills/shadow-library-ecosystem/references/api-catalog.md`.

## Conventions & Standards

> This section is the contract every app in the ecosystem follows. If you are an AI or a developer writing
> code against this package, treat these rules as mandatory — they keep errors and configuration uniform
> across every service, so the same patterns read the same way everywhere.

### Error creation — the standard

Every failure in the ecosystem is an **`AppError`** produced by an **`ErrorCode`**. You never throw a bare
`Error`, and you never call `new AppError(...)` or `new ErrorCode(...)` directly. Instead each domain
declares a **catalog** by subclassing `ErrorCode`, and each entry is built with the factory that names its
category. The category fixes two things at once: the HTTP status, and whether the message may be shown to a
client.

**The rules:**

1. **One catalog per domain, declared by subclassing `ErrorCode`.** Name it `<Domain>ErrorCode`
   (`UserErrorCode`, `BillingErrorCode`). All of a module's failures live in its catalog.
2. **One `static readonly` entry per failure, built with a category factory** — never `new ErrorCode(...)`.
   The factory encodes the status and the exposure:

   | Factory           | Status | When to use                                       | Shown to client? |
   | ----------------- | ------ | ------------------------------------------------- | ---------------- |
   | `badRequest`      | 400    | malformed input or business-rule violation        | yes              |
   | `unauthenticated` | 401    | no established identity                           | yes              |
   | `forbidden`       | 403    | identity lacks the required privilege             | yes              |
   | `notFound`        | 404    | resource or identifier does not exist             | yes              |
   | `conflict`        | 409    | conflicts with the current state of the resource  | yes              |
   | `validation`      | 422    | syntactically valid but violates data constraints | yes              |
   | `unavailable`     | 503    | a dependency failed transiently (retryable)       | yes              |
   | `internal`        | 500    | a defect or broken invariant                      | **no — masked**  |

   Pass a trailing status argument only for outliers the factory name still fits (`badRequest(code, msg, 429)`).

3. **Code strings are `UPPER_SNAKE_CASE`, semantic, and unique.** `USER_NOT_FOUND`, `EMAIL_ALREADY_EXISTS` —
   a reader knows what happened from the code alone. Never opaque codes like `S001`. The static property name
   and the code string are identical.
4. **Messages describe the failure and interpolate context with `{placeholder}`.** Placeholders are filled
   from the `data` object passed when the error is created or thrown.
5. **Throw with `.throw(data?)`, create with `.create(data?)`, match with `AppError.is(err, catalogOrKey)`.**
   `.throw()` has return type `never`, so it composes inside `??`, ternaries, and guard clauses.

```ts
import { AppError, ErrorCode } from '@shadow-library/common/errors';

class UserErrorCode extends ErrorCode {
  static readonly USER_NOT_FOUND = UserErrorCode.notFound('USER_NOT_FOUND', 'User {id} not found');
  static readonly EMAIL_TAKEN = UserErrorCode.conflict('EMAIL_TAKEN', 'Email {email} is already registered');
  static readonly RATE_LIMITED = UserErrorCode.badRequest('RATE_LIMITED', 'Too many attempts, retry in {seconds}s', 429);
}

// throw — composes as a `never` expression
const user = (await repo.find(id)) ?? UserErrorCode.USER_NOT_FOUND.throw({ id });

// create without throwing
return UserErrorCode.EMAIL_TAKEN.create({ email });

// match one key, or a whole catalog
if (AppError.is(err, UserErrorCode.USER_NOT_FOUND)) retryWithNewId();
if (AppError.is(err, UserErrorCode)) reportToDomainTeam(err); // any error from this catalog
```

**Internal invariants** that must never reach a client use `AppError.internal(reason, cause?)`. The reason is
kept in logs (`toObject()`) but the response body (`toResponse()`) shows the generic `UNKNOWN` face — an
internal message is never leaked.

```ts
const row = insert(session) ?? AppError.internal('session insert returned no row').throw();
```

**Exposure & serialization.** `toResponse()` is the client-facing shape — internal errors are masked to
`UNKNOWN`. `toObject()` is the full-fidelity shape for logs and process-boundary transport (IPC, queues,
worker threads); it round-trips through `AppError.from(obj)` and **fails closed to internal** if the wire
object omits exposure, so a rehydrated error can never be downgraded from masked to exposed.

> **Why no built-in HTTP catalog?** There is deliberately no generic `HttpErrorCode`. A shared catalog forces
> opaque codes (`S001`…) that violate rule 3. Every app declares its own semantic catalog instead; the
> category factory already carries the HTTP status.

### Config key hierarchy — the standard

Config keys are **dot-delimited paths** of **2 to 7 segments** (`<domain>.<name>` at minimum, deepening to
`<domain>.<area>.<sub>.<name>` as needed), lowercase, most-general segment first. The hierarchy is
load-bearing: it drives env-var naming and prefix subscriptions.

**The rules:**

1. **A key may contain only lowercase letters, dots, and hyphens** (`[a-z.-]`) — nothing else. The dot is the
   hierarchy separator; use a hyphen inside a segment for multi-word names (`db.read-replica.url`). No
   uppercase, underscores, spaces, or digits in a key.
2. **The first segment is a bounded context / subsystem** — `app`, `log`, `db`, `redis`, `auth`, `mail`,
   `stripe`. Everything a subsystem owns lives under its prefix.
3. **Dots express hierarchy, never the value.** A key has **2 segments at minimum and 7 at most**; add depth
   only when a subsystem has distinct areas: `db.url` (2), `db.pool.max` (3), `auth.jwt.access.secret` (4).
4. **The env var is derived** by uppercasing the key and replacing `.`/`-` with `_`. So `db.pool.max` ⇄
   `DB_POOL_MAX` and `db.read-replica.url` ⇄ `DB_READ_REPLICA_URL`. Set `envKey` explicitly only for
   third-party names you do not own (e.g. `app.env` reads `NODE_ENV`).
5. **Declare keys and their value types by extending `ConfigRecords`** so every `get`/`load` is typed:

   ```ts
   import { ConfigService, ConfigRecords } from '@shadow-library/common/config';

   interface AppConfigs extends ConfigRecords {
     'db.url': string;
     'db.pool.max': number;
     'auth.jwt.secret': string;
   }

   const Config = new ConfigService<AppConfigs>();
   Config.load('db.url', { isProdRequired: true });
   Config.load('db.pool.max', { validateType: 'integer', defaultValue: '10' });
   ```

6. **Any prefix is subscribable.** Because keys are hierarchical, `Config.subscribe('db', cb)` fires for
   every `db.*` change, while `Config.subscribe('db.pool.max', cb)` fires only for that key.

| Config key    | Env var (derived)     | Example type                          |
| ------------- | --------------------- | ------------------------------------- |
| `app.env`     | `NODE_ENV` (override) | `development \| production \| test`   |
| `app.name`    | `APP_NAME`            | `string`                              |
| `log.level`   | `LOG_LEVEL`           | `silly \| debug \| http \| info \| …` |
| `log.dir`     | `LOG_DIR`             | `string`                              |
| `db.url`      | `DB_URL`              | `string`                              |
| `db.pool.max` | `DB_POOL_MAX`         | `number`                              |
