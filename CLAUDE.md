@AGENTS.md

## Claude-specific notes

- The `shadow-library-ecosystem` skill (in-repo at `.claude/skills/shadow-library-ecosystem/`) documents the packages' public APIs and conventions — consult it before writing any utility, helper, or component.
- Serena, Context7, Playwright, and `shadow-logs` MCP servers are configured in `.mcp.json`. Serena's symbolic tools are the default for code discovery and symbol edits — see "Code discovery" in `AGENTS.md` for which tool answers which question. Context7 is for public-library docs only and is never authoritative for `@shadow-library/*` packages.
- `shadow-logs` reads the dev cluster's logs — seven days of every container's output, queried with LogsQL. It is `gitops mcp dev` from the devops repository, which holds a port-forward for as long as the session lasts, so it needs the dev cluster up (`gitops up dev`) and reports as much when it is not. Its handshake carries the app-directory → namespace mapping and the field-quoting rules, so read those before composing a query rather than guessing at field names. Bound every query with `_time` and a limit.
