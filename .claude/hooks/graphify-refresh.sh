#!/usr/bin/env bash
# Rebuilds the graphify knowledge graph after a merge, so `graphify query` reflects the tree that was just
# merged rather than whatever the graph happened to be built from.
#
# Scans from the repo root rather than per workspace. `graphify update <workspace>` rewrites paths relative
# to the directory it scanned, which leaves `source_file` values that no longer resolve from the root and
# breaks the merged graph's path convention; a root scan keeps every path root-relative. It also covers
# scripts/, e2e/ and the root configs, which a per-workspace merge misses entirely. Extraction is AST-only
# and needs no LLM or API key; the LLM-derived layer (rationale/concept nodes and the semantic edges)
# survives a rebuild untouched.
#
#   .claude/hooks/graphify-refresh.sh            # background rebuild, logs to graphify-out/refresh.log
#   .claude/hooks/graphify-refresh.sh --sync     # run in the foreground and report

set -uo pipefail

command -v graphify >/dev/null 2>&1 || { echo "graphify: not installed — skipping graph refresh" >&2; exit 0; }

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# A worktree gets its graphs seeded from the main checkout and is expected to drift; rebuilding there would
# burn a minute per merge to produce a graph the worktree is about to be deleted with.
read -r git_dir git_common_dir <<<"$(git rev-parse --path-format=absolute --git-dir --git-common-dir 2>/dev/null | tr '\n' ' ')"
[ "$git_dir" = "$git_common_dir" ] || exit 0

# `update` refuses to write a graph with fewer nodes than the one on disk, which silently keeps phantom
# nodes for symbols the merge deleted. Converging on the merged tree is the entire point of this hook.
export GRAPHIFY_FORCE=1

log=graphify-out/refresh.log

run() {
  mkdir -p graphify-out
  if graphify update . >"$log" 2>&1; then
    printf 'graphify: graph refreshed (%s)\n' "$(date '+%H:%M:%S')" >>"$log"
  else
    printf 'graphify: refresh FAILED — see %s\n' "$log" >&2
  fi
}

if [ "${1:-}" = "--sync" ]; then
  echo "graphify: rebuilding knowledge graph (root scan, no LLM) ..."
  run
  tail -3 "$log"
  exit 0
fi

# Detached: a root scan takes ~70s on this monorepo, which is too long to block a merge on. The graph is
# not needed until someone next asks a question, so correctness here is worth more than immediacy.
( run & ) >/dev/null 2>&1
echo "graphify: knowledge-graph refresh started in background (log: $log)"
