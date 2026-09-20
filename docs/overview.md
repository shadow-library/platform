# Shadow Library Platform

## Purpose

- A Bun-workspaces monorepo of five products, each a server + web app pair, plus the shared packages they build on. Built by one person with AI-assisted development.
- Products are independently built and deployed; the monorepo changes how they are developed, not their runtime architecture. Docs hold intent and invariants; code answers the
  rest.

## Products

- **Identity** — the only place authentication and authorization live: OIDC provider, app sessions, step-up, M2M tokens, policy decisions, bots, admin for apps and roles.
- **Novel Forge** — AI-assisted novel authoring (story bible, planning, chapter generation with judge/repair, review, continuity, import/translation). Source of truth for novels.
- **Pulse** — notification service and operator console. Apps send by template key; Pulse renders, routes to a sender and logs the outcome (email via Resend is the only real provider today).
- **Web Novel** — public reading platform (catalog, reader, library, spoiler-gated wikis, PWA). A serving copy of content pushed from Novel Forge; owns no identities but does own reader state (library, progress) and app sessions.
- **Memoir** — personal gamified life-tracking (quests, hero progression, finance, AI insights). Offline-first PWA with client sync; notifies through Pulse.

## Shared packages

- `common`, `class-schema`, `app`, `fastify`, `modules`, `auth`, `ui`, `web` and `sdk` under `packages/`. `e2e/` is the cross-app Playwright suite; `scripts/` is root tooling.

## Doc map

- `AGENTS.md` is the entry point that points here; the `shadow-library-ecosystem` skill owns the package API catalog.
- `docs/architecture.md` — topology, integrations, contract-first API types, monorepo rules.
- `docs/packages.md` — shared package roles and hard rules.
- `docs/identity.md`, `docs/novel-forge.md`, `docs/pulse.md`, `docs/web-novel.md`, `docs/memoir.md` — one per product (server and web).

## Reading rule

- Before touching an app, read this file and that app's doc; before cross-app behaviour (auth, notifications, publishing), also `docs/architecture.md`.
