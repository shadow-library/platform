@AGENTS.md

## Claude-specific notes

- The `shadow-library-ecosystem` skill documents the packages' public APIs and conventions — consult it before writing any utility, helper, or component.
- Serena, Context7, and Playwright MCP servers are configured in `.mcp.json`; prefer Serena's symbolic tools for code discovery and edits. Context7 is for public-library docs only and is never authoritative for `@shadow-library/*` packages.
