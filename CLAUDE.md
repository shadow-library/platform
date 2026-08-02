@AGENTS.md

## Claude-specific notes

- The `shadow-library-ecosystem` skill (in-repo at `.claude/skills/shadow-library-ecosystem/`) documents the packages' public APIs and conventions — consult it before writing any utility, helper, or component.
- Serena, Context7, and Playwright MCP servers are configured in `.mcp.json`. Serena's symbolic tools are the default for code discovery and symbol edits — see "Code discovery" in `AGENTS.md` for which tool answers which question. Context7 is for public-library docs only and is never authoritative for `@shadow-library/*` packages.
