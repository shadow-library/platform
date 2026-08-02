#!/usr/bin/env bash
# Seeds a worktree with the main checkout's graphify knowledge graphs, so an agent working in an isolated
# worktree can answer "how does X work" from the graph instead of grepping cold.
#
# graphify-out/ is gitignored, so a fresh worktree starts with no graph at all. The graphs are safe to reuse
# verbatim: every path inside graph.json is repo-relative, so a graph built in the main checkout resolves
# correctly from any worktree.
#
# Copies rather than symlinks, deliberately. A symlink would let one worktree's `graphify update` write
# through into the main checkout's graph — publishing half-finished work to every other agent, and racing
# when several agents run in parallel. On APFS `cp -c` is a copy-on-write clone: ~12ms for all seventeen
# graphs, and no additional disk until one of them is rewritten.
#
# Runs on SessionStart, so it also covers worktrees created outside EnterWorktree (manual `git worktree
# add`, background-job isolation). Idempotent and near-free when the graphs are already there.

set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

read -r git_dir git_common_dir <<<"$(git rev-parse --path-format=absolute --git-dir --git-common-dir 2>/dev/null | tr '\n' ' ')"

# The main checkout is its own source of graphs; only a worktree needs seeding.
[ "$git_dir" != "$git_common_dir" ] || exit 0

main=$(dirname "$git_common_dir")
[ -d "$main" ] && [ "$main" != "$root" ] || exit 0

seeded=0
for dir in . $(ls -d apps/*/ packages/*/ 2>/dev/null | sed 's:/$::'); do
  src="$main/$dir/graphify-out"
  dest="$dir/graphify-out"
  [ -d "$src" ] || continue
  [ -e "$dest" ] && continue
  # -c requests an APFS clone; the plain -R retry keeps this working on non-APFS volumes and on Linux.
  cp -Rc "$src" "$dest" 2>/dev/null || cp -R "$src" "$dest" 2>/dev/null || continue
  seeded=$((seeded + 1))
done

[ "$seeded" -gt 0 ] || exit 0

read -r -d '' message <<EOF
graphify: seeded $seeded knowledge graph(s) into this worktree from the main checkout. Prefer 'graphify query' over grepping cold. The graphs reflect the main checkout, so they do not include changes made in this worktree yet.
EOF

# Built with jq rather than string interpolation: hand-escaped JSON here was silently invalid, and a
# malformed hook payload is dropped without an error anyone would notice.
jq -Rn --arg m "$message" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$m}}'
