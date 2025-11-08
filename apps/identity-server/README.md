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
- **Redis** (optional) for caching
- **Session-based authentication** for web clients with real-time invalidation
- **JWT-based access tokens** for API and service-to-service communication

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
| Cache (Optional) | **Redis**                      |
| Auth             | **Session-based + JWT tokens** |
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
bun run db:generate
bun run db:migrate
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

## 🔮 Future Enhancements

- OAuth2 and OpenID Connect support
- Multi-factor authentication (2FA / OTP / Passkeys)
- Session and device management dashboard
- Audit logs and login activity history
- Email and SMS verification flows
- Administrative API for service-level access control

---

## 🎯 Vision

The goal of the **Identity Service** is to provide a **centralized, secure, and scalable** identity layer for the entire ecosystem —
a foundation that enables seamless login, consistent access control, and a unified user experience across all connected applications.

---

## 📄 License

Licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.
