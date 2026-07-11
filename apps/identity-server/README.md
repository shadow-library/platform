# 🪪 Shadow Identity

The **Shadow Identity** is the central hub for **user identity, authentication, and authorization** within the ecosystem.
It provides a unified platform for managing users, sessions, tokens, and access control across all connected services — acting as the single source of truth for account and permission data.

---

## 🚀 Overview

The service is responsible for **account management**, **secure login**, **authorization**, and **cross-service identity** integration.
It allows users to sign in once and securely access multiple services within the ecosystem.

Built with **[Bun](https://bun.sh/)** for high performance and modern tooling, it combines:

- **PostgreSQL** for persistent data storage
- **Drizzle ORM** for schema management and migrations
- **Redis** for caching, auth-flow state, rate limiting, and revocation
- **Opaque server-side sessions** for the identity domain, with real-time invalidation
- **OAuth 2.1 / OpenID Connect** (EdDSA-signed JWTs) for application login and service-to-service calls

> **Architecture & build plan:** the target design and development backlog are specified in
> [`docs/architecture.md`](./docs/architecture.md), [`docs/database.md`](./docs/database.md),
> [`docs/auth/`](./docs/auth/), [`docs/sdk.md`](./docs/sdk.md), and [`docs/tasks.md`](./docs/tasks.md).
> These supersede earlier design notes where they disagree.

> **Repository layout:** this repo hosts both the identity server (`src/`) and the consumer SDK
> [`@shadow-library/auth`](./packages/auth/README.md) (`packages/auth`, a Bun workspace package).
> They share protocol logic, and the SDK is integration-tested against the real server on every commit.

---

## 🧩 Core Features

### 🔐 Authentication & Authorization

- Secure **session-based authentication** for browser clients
- **Immediate session invalidation** and logout support
- **API JWT tokens** for external and service-to-service access
- **Role-based and permission-based authorization**
- Support for **multi-session** users and **device tracking**

### 👤 User Management

- User registration and profile management
- Email verification and password recovery flows
- Account deactivation and reactivation
- Fine-grained control over user roles and access levels

### 🌐 Ecosystem Integration

- Single sign-on experience across multiple internal services
- RESTful APIs for user introspection, token validation, and permission checks
- Designed for scalability and modular expansion

---

## ⚙️ Technology Stack

| Component        | Technology                     |
| ---------------- | ------------------------------ |
| Runtime          | **Bun**                        |
| Language         | **TypeScript**                 |
| Database         | **PostgreSQL**                 |
| ORM              | **Drizzle ORM**                |
| Cache            | **Redis** (required)           |
| Auth             | **Opaque sessions + OAuth 2.1 / OIDC (EdDSA JWTs)** |
| API              | **REST**                       |
| Docs             | **/dev/api-docs**              |

---

## ⚙️ Development Setup

### Prerequisites

- [Bun](https://bun.sh/)
- [PostgreSQL](https://www.postgresql.org/)
- (Optional) [Redis](https://redis.io/)

### Installation

```bash
git clone https://github.com/shadow-library/identity.git
cd identity
bun install
```

### Environment Configuration

All required and optional environment variables are listed in the .env.example file at the project root.
Copy it to create your local environment file:

```bash
cp .env.example .env
```

You can then modify values as needed for your setup.

### 📘 API Documentation

Interactive API documentation is available at:

```bash
GET /dev/api-docs
```

This endpoint lists all REST routes, authentication methods, and response schemas.

> Note: The service is in active development — endpoints are being implemented progressively.

---

## 🧰 Database Management

Use **Drizzle ORM** for schema management and migrations:

```bash
# Generate Migrations
bunx drizzle-kit generate

# Execute Migrations
bunx drizzle-kit migrate

# View DB
bunx drizzle-kit studio
```

---

## 🧪 Running & Testing

Start the service:

```bash
bun run dev
```

Run tests:

```bash
bun test
```

---

## 🔮 Roadmap

Delivery is planned in ordered milestones (see [`docs/tasks.md`](./docs/tasks.md)):

- **M0** — remediate the correctness/security defects in the current code and repair the build
- **M1** — production foundation: key management + JWKS, sessions, auth flows, refresh-token rotation, audit, tenancy isolation, notifications/worker
- **M2** — OAuth 2.1 / OpenID Connect authorization server
- **M3** — policy decision point + the `@shadow-library/auth` consumer SDK
- **M4** — MFA (TOTP, passkeys, recovery codes)
- **M5+** — security intelligence, operations, admin surfaces, then enterprise federation/SCIM (deferred, designed-for)

---

## 🎯 Vision

The goal of the **Identity Service** is to provide a **centralized, secure, and scalable** identity layer for the entire ecosystem —
a foundation that enables seamless login, consistent access control, and a unified user experience across all connected applications.

---

## 📄 License

Licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.
