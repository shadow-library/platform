# Database Schema Documentation

This document outlines the database architecture for the Identity and Access Management (IAM) system. The schema is designed to support a centralized authentication provider (similar to Google/Microsoft Accounts), handling multi-tenancy, multiple authentication providers, and secure session management.

## Visual Schema

```mermaid
---
config:
  layout: elk
---
erDiagram
  direction RL
  application_configurations {
    integer application_id FK ""
    character_varying_255_ config_name  ""
    text config_value  ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone updated_at  ""
  }

  applications {
    integer id PK ""
    character_varying_255_ name UK ""
    character_varying_255_ display_name  ""
    text description  ""
    boolean is_active  ""
    character_varying_255_ sub_domain  ""
    text home_page_url  ""
    text logo_url  ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone updated_at  ""
  }

  application_keys {
    integer id PK ""
    character_varying_255_ name  ""
    integer application_id FK ""
    text public_key  ""
    public_key_algorithm algorithm  ""
    boolean is_default  ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone updated_at  ""
  }

  application_roles {
    integer id PK ""
    integer application_id FK ""
    character_varying_255_ role_name  ""
    text description  ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone updated_at  ""
  }

  organisation_members {
    bigint organisation_id FK ""
    bigint user_id FK ""
    boolean is_default  ""
    organisation_member_role role  ""
    timestamp_without_time_zone joined_at  ""
  }

  organisations {
    bigint id PK ""
    character_varying_255_ name  ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone updated_at  ""
  }

  users {
    bigint id PK ""
    character_varying_32_ username UK ""
    user_status status  ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone updated_at  ""
  }

  user_auth_identities {
    bigint id PK ""
    bigint user_id FK ""
    user_auth_provider provider  ""
    character_varying_128_ provider_key  ""
    timestamp_without_time_zone created_at  ""
  }

  user_emails {
    bigint user_id FK ""
    character_varying_255_ email_id UK ""
    boolean is_primary  ""
    boolean is_verified  ""
    timestamp_without_time_zone created_at  ""
  }

  user_passwords {
    bigint user_auth_identity_id PK,FK ""
    text hash  ""
    password_algorithm algorithm  ""
    integer version  ""
    timestamp_without_time_zone created_at  ""
  }

  user_phones {
    bigint user_id FK ""
    character_varying_15_ phone_number UK ""
    boolean is_primary  ""
    boolean is_verified  ""
    timestamp_without_time_zone created_at  ""
  }

  user_profiles {
    bigint user_id PK,FK ""
    character_varying_64_ first_name  ""
    character_varying_64_ last_name  ""
    character_varying_64_ display_name  ""
    gender gender  ""
    date date_of_birth  ""
    text avatar_url  ""
  }

  user_session_tokens {
    uuid id PK ""
    bigint session_id FK ""
    bigint application_id FK ""
    character_varying_512_ token_hash UK ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone expires_at  ""
    timestamp_without_time_zone revoked_at  ""
    character_varying_45_ ip_address  ""
    character_varying_2_ ip_country  ""
    bigint previous_token_id  ""
  }

  user_sessions {
    bigint id PK ""
    bigint user_id FK ""
    uuid user_sign_in_event_id FK ""
    session_status status  ""
    timestamp_without_time_zone expires_at  ""
    timestamp_without_time_zone terminated_at  ""
    timestamp_without_time_zone created_at  ""
    timestamp_without_time_zone last_used_at  ""
    timestamp_without_time_zone elevated_until  ""
  }

  user_sign_in_events {
    uuid id PK ""
    bigint user_id FK ""
    character_varying_255_ identifier  ""
    sign_in_status status  ""
    user_auth_provider auth_mode_used  ""
    user_auth_provider mfa_mode_used  ""
    timestamp_without_time_zone created_at  ""
    character_varying_255_ device_id  ""
    character_varying_45_ ip_address  ""
    character_varying_2_ ip_country  ""
    text user_agent  ""
  }

  application_configurations}o--||applications:"configuration_belongs_to_app"
  application_keys}o--||applications:"keys_belong_to_app"
  application_roles}o--||applications:"roles_belong_to_app"
  organisation_members}o--||organisations:"member_belongs_to_org"
  organisation_members}o--||users:"member_is_a_user"
  user_auth_identities}o--||users:"identity_belongs_to_user"
  user_emails}o--||users:"email_belongs_to_user"
  user_passwords|o--||user_auth_identities:"password_authenticates_identity"
  user_phones}o--||users:"phone_belongs_to_user"
  user_profiles||--||users:"profile_describes_user"
  user_session_tokens}o--||applications:"token_scoped_to_app"
  user_session_tokens}o--||user_sessions:"token_belongs_to_session"
  user_sessions}o--||users:"session_belongs_to_user"
  user_sessions|o--||user_sign_in_events:"session_initiated_by_event"
  user_sign_in_events}o--||users:"event_belongs_to_user"
```

## 1. User Core Domain

These tables handle the fundamental data regarding a user entity.

| Table               | Description                                                                                                                                             |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`users`**         | The central anchor table. It contains the minimal unique identifier (`id`, `username`) and the account status (Active, Suspended, etc.).                |
| **`user_profiles`** | A 1:1 extension of the user table containing personal details like Name, Gender, DOB, and Avatar. Separating this allows `users` to remain lightweight. |
| **`user_emails`**   | Stores email addresses associated with a user. Supports multiple emails per user, with flags for `is_primary` and `is_verified`.                        |
| **`user_phones`**   | Stores phone numbers. Similar to emails, supports multiple entries per user for recovery or MFA purposes.                                               |

## 2. Authentication Domain

This domain separates the _User_ (who they are) from the _Method_ (how they prove it).

| Table                      | Description                                                                                                                                                                 |
| :------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`user_auth_identities`** | This is the pivot point for login methods. A user can have multiple identities (e.g., one for "Password" auth, one for "Google OAuth", one for "GitHub").                   |
| **`user_passwords`**       | Stores hashed passwords. **Crucially, this links to `user_auth_identities`, not `users`.** This treats "Password" as just another provider type, making the system modular. |

## 3. Session & Security Domain

These tables manage the active state of users and audit their access.

| Table                     | Description                                                                                                                                                                                  |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`user_sign_in_events`** | An immutable audit log of every login attempt. Tracks IP, Device, Country, User Agent, and the specific Auth/MFA modes used.                                                                 |
| **`user_sessions`**       | Represents a continuous period of activity. A session is created upon a successful `sign_in_event`. It tracks the session lifecycle (Active, Terminated) and "sudo mode" (`elevated_until`). |
| **`user_session_tokens`** | The actual artifacts (Refresh Tokens) issued to the client. This allows token rotation (refreshing the access token) and revocation without destroying the underlying session data.          |

## 4. Application Domain (OIDC/OAuth Clients)

Since this system acts as an Identity Provider (IdP), other services ("Applications") rely on it for user data.

| Table                            | Description                                                                                                      |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| **`applications`**               | Represents a client application (e.g., "My ToDo App", "Company Portal") allowed to use this Auth Server.         |
| **`application_keys`**           | Stores public keys or secrets used for signing JWTs or verifying requests specific to an application.            |
| **`application_configurations`** | A key-value store for app-specific settings (e.g., allowed redirect URIs, theme preferences).                    |
| **`application_roles`**          | Defines roles specific to that application (e.g., "Admin" within the "ToDo App"), allowing RBAC per application. |

## 5. Organization Domain

Supports grouping users into teams or companies (Multi-tenancy).

| Table                      | Description                                                                                                                     |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **`organisations`**        | The entity representing a company or team.                                                                                      |
| **`organisation_members`** | A join table linking `users` to `organisations`. Includes the user's role _within that organization_ and default context flags. |

---

### Key Architectural Decisions

- **Identity Separation:** By separating `users` from `user_auth_identities`, we can easily add new providers (Apple, Facebook, SAML) without altering the core user table.
- **Session vs. Token:** Splitting `user_sessions` (logical state) from `user_session_tokens` (physical artifacts) allows for high-security features like "Revoke all tokens for this session" or detecting token theft via reuse (using `previous_token_id`).
- **Auditability:** The `user_sign_in_events` table ensures strict compliance logging for security audits.
