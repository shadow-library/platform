# @shadow-library/novel-forge-server

Backend service for an AI-powered novel generation platform that guides users through the complete novel creation process. Starting from a simple idea, the platform incrementally generates and manages the story bible, world setting, characters, locations, plot, volumes, chapter briefs, and chapters. Each stage supports human review and refinement, while maintaining a structured lore system to ensure consistency throughout the novel.

The server also includes AI-powered validation pipelines that detect continuity issues, contradictions, and lore inconsistencies before finalized chapters are incorporated back into the project's knowledge base.

Built with **TypeScript**, **Bun**, **Fastify**, and **`@shadow-library/app`** / **`@shadow-library/fastify`**, providing a modular, dependency injection-based architecture similar to NestJS.

## Features

- AI-powered novel generation workflows
- Story bible creation and management
- World, character, location, and lore generation
- Plot, volume, arc, and chapter planning
- Chapter generation and revision pipeline
- Human approval workflow
- Continuity and contradiction validation
- Lore extraction and knowledge management
- Integration with multiple LLM providers

## Tech Stack

- Bun
- TypeScript
- Fastify
- `@shadow-library/app`
- `@shadow-library/fastify`

## Getting Started

### Install dependencies

```bash
bun install
```

### Run in development

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Start

```bash
bun run start
```

### Run tests

```bash
bun test
```

## License

Private.
