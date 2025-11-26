# **Shadow Identity: Scalable Authentication Solution**

## **1. Architecture Overview**

This solution adopts a **State-Based Authentication Architecture** for high performance. The state of a user's journey is stored in **Redis**, while permanent records (Users, Credentials, Logs) reside in **PostgreSQL**.

### **High-Level Component Interaction**

1. **Client (Web/Mobile)**: Interacts with the API. Relies on **secure, HTTP-only cookies** for tokens and a **browser-readable cookie** for session status.
2. **Auth Service (API)**: Stateless workers. Reads state from Redis, processes logic, and sets/clears cookies via Set-Cookie headers.
3. **Redis (Cache)**: Stores ephemeral flowId data with TTL (Time-To-Live).
4. **PostgreSQL (DB)**: Stores `users`, `credentials`, and finalized `sessions` and `user_sign_in_events`.

## **2. Redis Data Model (The "Flow")**

The core of this scalable design is the flowId. It is a pointer to a user's current authentication context. This flowId is also used as the primary key for the `user_sign_in_events` table once the user attempts a credential submission.

The Flow Manager handles the logic, state definitions, and transitions in code. Redis is used exclusively to persist the Flow Context—the stateful object containing all data accumulated during a user's specific execution of a flow.

**Key Pattern:** `auth_flow:{uuid}`
**Type:** Redis Hash or JSON  
**TTL:** 10-15 Minutes (The auth flow expires after this and the user has to start again)

### Context Object Structure

The stored value is a JSON object representing the FlowContext. It contains the following data categories:

| Field              | Type    | Description                                                                                                                                     |
| :----------------- | :------ | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| identifier         | String  | Input provided by user (email/phone).                                                                                                           |
| userId             | String  | Resolved DB ID (if user exists).                                                                                                                |
| authModeUsed       | String  | Stores the primary method used in the current attempt (e.g., PASSWORD). Populates user_sign_in_events.auth_mode_used.                           |
| mfaModeUsed        | String  | Stores the secondary method used (e.g., TOTP). Populates user_sign_in_events.mfa_mode_used.                                                     |
| device             | JSON    | Device fingerprint, IP, User Agent (for fraud detection).                                                                                       |
| regData            | JSON    | Temporary storage for registration fields (DOB, Names) before DB commit.                                                                        |
| globalFailureCount | Integer | **Limit: 5**. Tracks total incorrect attempts across all methods combined. If this hits 5, the entire flow is locked/terminated.                |
| failureCount       | Integer | **Limit: 3**. Tracks failures for the current method. If this hits 3, the entire flow is locked/terminated.                                     |
| globalResendCount  | Integer | **Limit: 5.** Tracks total OTP resend requests.                                                                                                 |
| resendCount        | Integer | **Limit: 3.** Tracks total OTP resend requests.                                                                                                 |
| activeChallenge    | JSON    | Stores the currently active OTP/secret for verification. Should contain: `{ "code": "123456", "method": "SMS_OTP", "expiresAt": <timestamp> }`. |

## **3. Detailed Workflows**

### **A. Authentication (Login)**

The login flow is dynamic. The client reacts to the `status` returned by the server rather than assuming a fixed sequence.

**Mermaid Visualization:**

```mermaid
flowchart TB
  USER_IDENTIFIED --> SELECT_AUTH_MODE

  SELECT_AUTH_MODE --> AWAITING_WEBAUTHN & AWAITING_PASSWORD
  SELECT_AUTH_MODE --> SEND_SMS_OTP & SEND_EMAIL_OTP & AWAITING_TOTP

  SEND_SMS_OTP --> AWAITING_SMS_OTP
  SEND_EMAIL_OTP --> AWAITING_EMAIL_OTP

  AWAITING_EMAIL_OTP & AWAITING_SMS_OTP --> SELECT_AUTH_MODE & COMPLETED
  AWAITING_WEBAUTHN & AWAITING_PASSWORD --> SELECT_AUTH_MODE & COMPLETED
```

**Phase 1: Identification (`POST /auth/login/init`)**

- **DB/Redis Action:** Only Redis flow created. No user_sign_in_events logged yet.
- **Logic:** If the user does not exist, return 404 Not Found immediately (No sign-in event logged). **Crucially: Before returning methods, check User's Persistent Lock Status (Tier 4). If locked, only include OTP methods in allowedMethods.**

**Phase 2: Challenge (`POST /auth/challenge/resend`)**

- **DB/Redis Action:** Increments resendCount in Redis.

**Phase 3: Credential Submission and Logging (`POST /auth/challenge/verify`)**

This is the point where the `user_sign_in_events` is first created. The checks are as follows:

1.  **Throttle Check (Redis Tier 3):** Check and increment `failureCount` in Redis. If maxed out (3 attempts), terminate flow and log final state (see Tier 3 below).
2.  **If credential is Invalid:**
    - **Global Lock Check (PostgreSQL Tier 4):** Query user_sign_in_events for recent failed attempts. If the count exceeds the configured limit (5), execute the lock-out procedure.
    - **DB Transaction (Failed Log):** Insert into user_sign_in_events.
      - `id`: `flowId` (from Redis).
      - `status`: `INVALID_CREDENTIALS`.
      - `auth_mode_used`, `user_id`, `identifier`, and context fields from Redis.
    - Return error to client.
3.  **Logic (Success):**
    - **DB Transaction (Success Log):** Insert into user_sign_in_events (or update if this was an MFA step).
      - `id`: `flowId`.
      - `status`: `SUCCESS`.
      - All other fields populated.
    - If MFA required, update Redis flow `status`.
    - If Login Complete, proceed to Session Creation.

**Phase 4: Session Creation (Final Step)**

- **Token Generation:**
  - **Access Token:** JWT, valid ~1 hour.
  - **Refresh Token:** Secure, random Opaque String, long-lived.
- **DB Transaction:**
  1. Insert into user_sessions (This becomes the Primary Session).
     - `user_sign_in_event_id`: Set to the `flowId` UUID.
     - `application_id`: Set to the ID of the Accounts App/Identity Service.
  2. Insert into `user_session_tokens`.
     - `token_hash`: Hash of the Opaque Refresh Token.
  3. The Access Token and Refresh Token are typically set as secure, HTTP-only cookies on the Identity domain (`identity.shadow-apps.com`).
  4. Return the JWT Access Token and the Opaque Refresh Token to the client.

- **Client Delivery (Crucial):**
  - Set **Access Token** as secure, HTTP-only cookie.
  - Set **Refresh Token** as secure, HTTP-only cookie.
  - Set **isLoggedIn** (boolean, **NOT HttpOnly**) as secure cookie for client-side session detection.

### **B. Registration (Sign Up)**

The registration flow is a multi-step process designed to collect data sequentially before committing the new user to the database. The final commit occurs in Phase 4.

**Mermaid Visualization:**

```mermaid
flowchart TB
  REGISTRATION_INIT --> SEND_EMAIL_OTP --> AWAITING_EMAIL_OTP
  AWAITING_EMAIL_OTP --> AWAITING_DEMOGRAPHICS --> AWAITING_PROFILE --> COMPLETED
```

**Phase 1: Initiate Registration (`POST /auth/register/init`)**

- **Client Action:** Submits email and deviceFingerprint.
- **DB/Redis Action:**
  1. Check `user_emails` table: If email exists, return `409 Conflict`.
  2. Create Redis Flow key (`auth_flow:{flowId}`) with `status: REGISTRATION_INIT`.
- **Next Step:** Client requests OTP via /auth/challenge.

**Phase 2: Verify Email OTP (`POST /auth/challenge/verify`)**

- **Client Action:** Submits flowId and OTP_EMAIL code.
- **DB/Redis Action:**
  1. Validate OTP against stored code (or external service).
  2. If successful, update Redis flow `status: AWAITING_DEMOGRAPHICS`.
  3. If failed, increment `failureCount` and return `401 Unauthorized`.
- **Next Step:** Client submits demographics via `/auth/register/demographics`.

**Phase 3: Set Demographics (`POST /auth/register/demographics`)**

- **Client Action:** Submits flowId, dateOfBirth, and gender.
- **DB/Redis Action:**
  1. Update the Redis Flow `regData` hash with the submitted fields.
  2. Update Redis flow `status: AWAITING_PROFILE`.
- **Next Step:** Client submits profile name via `/auth/register/profile`.

**Phase 4: Set Profile & Complete (`POST /auth/register/profile`)**

- **Client Action:** Submits flowId, firstName, and lastName.
- **DB Transaction (Commit User):** This is a single, atomic transaction.
  1. Insert into `users` table.
  2. Insert into `user_emails` (marked as `is_verified=true`, `is_primary=true`).
  3. Insert into `user_profiles` (using data from flow's `regData` and submitted profile names).
  4. Insert into `user_auth_identities` (defaulting to `OTP` method).
  5. Execute **Session Creation** (See Section 3.A, Phase 4).
  6. The `user_sign_in_events` record is created with `status: SUCCESS` for the final login.
- **Next Step:** Return `SessionResponse` to client.

### **C. Account Recovery (Forgot Password)**

The recovery flow ensures the user proves ownership of the account before a password reset is permitted, culminating in a successful login after the reset.

**Mermaid Visualization:**

```mermaid
flowchart TB
  RECOVERY_INIT --> SEND_SMS_OTP & SEND_EMAIL_OTP

  SEND_SMS_OTP --> AWAITING_SMS_OTP
  SEND_EMAIL_OTP --> AWAITING_EMAIL_OTP

  AWAITING_EMAIL_OTP & AWAITING_SMS_OTP --> AWAITING_NEW_PASSWORD
  AWAITING_NEW_PASSWORD --> COMPLETED
```

**Phase 1: Initiate Recovery (`POST /auth/recover/init`)**

- **Client Action:** Submits `email`.
- **DB/Redis Action:**
  1. Look up user ID by email. If not found, return `404 Not Found` (avoids enumeration).
  2. Create Redis Flow key (`auth_flow:{flowId}`) with `status: RECOVERY_INIT` and associated `userId`.
  3. Send the OTP via email or phone number of the user and set the flow status as `AWAITING_SMS_OTP` or `AWAITING_EMAIL_OTP`
- **Next Step:** Client requests OTP via `/auth/challenge`.

**Phase 2: Verify Recovery OTP (`POST /auth/challenge/verify`)**

- **Client Action:** Submits `flowId` and `OTP_EMAIL` code.
- **DB/Redis Action:**
  1. DB Logging (Attempt): Create initial entry in `user_sign_in_events` with `status: FAILED` or `INVALID_CREDENTIALS` if incorrect.
  2. If OTP successful, update Redis flow `status: AWAITING_NEW_PASSWORD`.
- **Next Step:** Client submits new password to `/auth/recover/reset`.

**Phase 3: Reset Password & Complete (POST /auth/recover/reset)**

- **Client Action:** Submits `flowId` and `newPassword`.
- **DB Transaction (Reset & Login):**
  1. Find the user's `PASSWORD` identity ID in `user_auth_identities`. If one does not exist, create a new record.
  2. Update/Insert the new hash into `user_passwords`.
  3. Execute Session Creation (See Section 3.A, Phase 4).
  4. The `user_sign_in_events` record is finalized with `status: SUCCESS`.
- **Next Step:** Return `SessionResponse` to client.

### **D. Session Management (Refresh)**

This workflow implements conditional Refresh Token rotation.

**Action: Refresh Session (`POST /auth/session/refresh`)**

- **Server Action:** Reads Access Token (AT) and Refresh Token (RT) from cookies.
- **Logic:**
  1. **Validate RT:** Find token hash in `user_session_tokens`. Check if `revoked_at` is `NULL` and `expires_at` is in the future.
  2. **Check AT Validity:** Inspect the expiry time (`exp` claim) of the JWT Access Token.
     - **If AT is VALID (not expired):** Generate a **new AT only**. No RT rotation or revocation.
     - **If AT is EXPIRED:** Perform full rotation:
       - **Revoke Old RT:** Set `revoked_at` on the old `user_session_tokens` record.
       - **Generate New RT:** Create and insert a new token record, linked to the same primary session.
       - **Generate New AT.** payload contains the `user_session_tokens.id` field of the refresh token.
- **Security Check: Token Reuse Detection (CRITICAL)**
  - **Trigger:** If the submitted Refresh Token is found in the database but has a `non-NULL` `revoked_at` timestamp (meaning it has already been used and revoked by a newer token), this indicates a **Refresh Token Theft Attempt**.
  - **Action:** Immediately terminate the _entire primary session_ associated with this token (the `user_sessions` record). This triggers a global log-out (see Section 3.F).
- **Client Delivery:** New tokens and `isLoggedIn` cookie are set via `Set-Cookie` headers.

### **E. First-Party Single Sign-On (SSO)**

This flow describes how users access other services without needing a second login.
**Mechanism:** The Identity Service acts as the central Session Authority. Sessions are validated by checking a primary session cookie, similar to a simplified OpenID Connect flow.

**Scenario 1: User Navigates to a First-Party App (e.g., `blog.shadow-apps.com`)**

1. **App Check:** The First-Party App checks its local session cookie. If missing, it redirects the user to the Identity Service.
2. **Redirection:** The App redirects the user to a dedicated SSO endpoint on the Identity Service.
   - **Endpoint:** `GET https://identity.shadow-apps.com/sso/authorize?serviceId={APP_ID}&redirectUri={APP_CALLBACK_URL}`
3. **Identity Service Check:** The Identity Service checks for the presence of the primary Access Token and Refresh Token cookies established in Phase 4 of the login.
   - **If Authenticated:** The Identity Service validates the primary session (`user_sessions` status).
     - It then issues a Service-Specific Access Token (or sets a unique session cookie for the App).
     - Finally, it redirects the user back to the `redirectUri` provided in the query parameters, often with a temporary authorization code (or the token itself, if secure).
   - **If NOT Authenticated:** The Identity Service redirects the user to the Login page (`/auth/login`) and stores the original `redirectUri` in a temporary cookie or flow state.
4. **Post-Login Redirect:** Once the user successfully logs in (completes Phase 4), the Identity Service checks the stored state and redirects them to the original App's `redirectUri`.

### **F. Sign-Out Policy (Local vs. Global)**

This section details the two-tier sign-out policy.

**Action: Local Sign Out (Service-Initiated)**

- **Goal:** Log the user out of a specific First-Party App only.
- **Mechanism:** The App calls an internal IdS endpoint (e.g., `/sso/revoke?serviceId={APP_ID}`) to revoke its specific token in `user_session_tokens`. The primary IdS cookies (AT, RT, isLoggedIn) **remain untouched**. The user is still logged in to the Identity Service and other First-Party Apps.

**Action: Global Sign Out (`POST /auth/signout`)**

- **Goal:** Terminate all user sessions across all services.
- **Mechanism:**
  1. **Identify and Terminate Primary Session:** Use AT from cookie to find and update the primary `user_sessions` status to `TERMINATED`.
  2. **Clear Identity Cookies:** The API clears the AT, RT, and `isLoggedIn` cookies by setting them with an immediate expiry date in the Set-Cookie headers.
  3. **Cascade Revocation (CAV):** All service-specific tokens in `user_session_tokens` linked to this primary session are revoked. A mechanism (e.g., a message queue) notifies all First-Party Apps to force log-out (destroy their local tokens/sessions).

## **7. Rate Limiting Strategy (Implementation Guide)**

The rate limiting strategy is now divided into four tiers. Tier 4 uses the persistent database for global account lockout.

**Tier 1: IP-Based Limiting (DDoS & Bot Prevention)**

- **Goal:** Prevent a single IP from flooding the API.
- **Redis Key:**
- **Limits:** 100 requests / minute (General), 5 requests / hour (`/auth/register/init`).

**Tier 2: Identifier-Based Limiting (Spam & Harassment Prevention)**

- **Goal:** Prevent "SMS/Email Bombing."
- **Redis Key:** `rl:id:{email_or_phone}:{action}`
- **Flow-Based Resend Control:** The resendCount field in the active `auth_flow` key is used to limit resends for that specific login attempt. Max 3 resends per 10 minutes.

**Tier 3: Flow-Based Brute Force Protection (Immediate Lock)**

- **Goal:** Stop rapid password/OTP guessing within a single login attempt.
- **Redis Key:** The active `auth_flow:{uuid}` hash.
- **Limit:** Max 3 failed credential submissions (password or OTP) per `flowId`.
- **Logic:** On the 4th failure, the flow key is deleted (410 Gone) and the final `user_sign_in_events` is logged with status `FAILED` (or `ACCOUNT_LOCKED` if Tier 4 was triggered).

**Tier 4: Persistent Account Lock (Global User Policy via PostgreSQL)**

- **Goal:** Persistently lock the user's primary credential (`PASSWORD`) after repeated failed login attempts from different devices/flows over a time window.
- **Configuration Source:** `application_configurations` table (Max attempts: 5, Duration: 15 minutes).
- **Mechanism:** Queries the `user_sign_in_events` table.
- **Logic (Triggered on any `INVALID_CREDENTIALS` event):**
  1. **Query DB:** Execute a query to count all sign-in events for the user in the last 15 minutes where `status` is either `INVALID_CREDENTIALS` or `MFA_FAILED`.
     ```sql
     -- Example PostgreSQL Query Logic
     SELECT COUNT(id) FROM user_sign_in_events
     WHERE user_id = :userId
     AND created_at > NOW() - INTERVAL '15 minutes'
     AND status IN ('INVALID_CREDENTIALS', 'MFA_FAILED');
     ```
  2. **Lock Check:** If the count is >= 5:
     - Update a flag on the user's permanent record (e.g., set auth_lock_mode = 'OTP_ONLY' in a dedicated lock table).
     - Log the final user_sign_in_events status as ACCOUNT_LOCKED.
     - Subsequent login attempts via /auth/login/init will only offer OTP methods.

  3. **If Login Success:** No database action is required, as the successful login implicitly breaks the 15-minute window of failed attempts.
