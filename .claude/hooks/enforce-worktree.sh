#!/usr/bin/env bash
# Denies writes that would land in a repository's main checkout or on a protected branch, so every change
# starts from an isolated worktree on its own branch. Files outside any git repository, and the repository's
# own .claude/ agent configuration, are left alone.
#
# Git context is derived from the target path rather than the hook's working directory, so the verdict stays
# correct no matter which directory the session was launched from.

set -uo pipefail

PROTECTED_BRANCHES="main master"

deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":%s}}\n' "$(jq -Rn --arg reason "$1" '$reason')"
  exit 0
}

target=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -n "$target" ] || exit 0

# A Write may target a file whose parent directories do not exist yet; walk up to the nearest real ancestor.
dir=$(dirname "$target")
while [ ! -d "$dir" ] && [ "$dir" != "/" ] && [ "$dir" != "." ]; do dir=$(dirname "$dir"); done
cd "$dir" 2>/dev/null || exit 0

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0

# Agent configuration is meta-work on the tooling rather than on the product, and gating it would lock the
# policy's own escape hatch behind a worktree. Note this resolves per repository root, so a worktree's own
# source files are never exempted by their position under the parent checkout's .claude/worktrees/.
case "${target#"$root"/}" in .claude/*) exit 0 ;; esac

read -r git_dir git_common_dir <<<"$(git rev-parse --path-format=absolute --git-dir --git-common-dir 2>/dev/null | tr '\n' ' ')"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$git_dir" = "$git_common_dir" ]; then
  deny "$target is in the main checkout ($root). Repository policy requires every edit to happen in a git worktree — call the EnterWorktree tool to branch into one, then retry this edit."
fi

for protected in $PROTECTED_BRANCHES; do
  if [ "$branch" = "$protected" ]; then
    deny "The worktree holding $target is on the protected branch '$branch'. Repository policy forbids editing it directly — create a feature branch (git switch -c <name>) and retry this edit."
  fi
done

exit 0
