#!/usr/bin/env bash
# Adds the agent-kit card fields to an EXISTING GitHub Project (v2). Safe to re-run: only missing fields are created.
# Never deletes or modifies existing fields or items.
# Requires: gh logged in with the project scope (gh auth refresh -s project).
# Usage: scripts/gh-board-attach.sh <project-number>   (owner defaults to @me; override with OWNER=...)
set -euo pipefail
NUM="${1:?usage: gh-board-attach.sh <project-number>}"
OWNER="${OWNER:-@me}"

if ! gh project view "$NUM" --owner "$OWNER" --format json >/dev/null 2>&1; then
  echo "Project $NUM not found for owner $OWNER (or gh lacks the project scope: gh auth refresh -s project)." >&2
  exit 1
fi

EXISTING=$(gh project field-list "$NUM" --owner "$OWNER" --limit 100 --format json -q '.fields[].name')
CREATED=()
SKIPPED=()

has() { grep -Fxq -- "$1" <<<"$EXISTING"; }

# add NAME TYPE [OPTIONS]
add() {
  local name="$1" type="$2" opts="${3:-}"
  if has "$name"; then SKIPPED+=("$name"); return; fi
  if [ -n "$opts" ]; then
    gh project field-create "$NUM" --owner "$OWNER" --name "$name" --data-type "$type" --single-select-options "$opts" >/dev/null
  else
    gh project field-create "$NUM" --owner "$OWNER" --name "$name" --data-type "$type" >/dev/null
  fi
  CREATED+=("$name")
}

add "Kind"         SINGLE_SELECT "Map,Work"
add "Stage"        SINGLE_SELECT "Backlog,Ready,In progress,Verify,Review,Done,Blocked"
add "Priority"     SINGLE_SELECT "P0,P1,P2"
add "Size"         SINGLE_SELECT "S,M,L"
add "Risk"         SINGLE_SELECT "low,medium,high"
add "Start tier"   SINGLE_SELECT "haiku,sonnet,opus"
add "Current tier" SINGLE_SELECT "haiku,sonnet,opus"
add "Card ID"      TEXT
add "Story step"   TEXT
add "Depends on"   TEXT
add "Slice"        NUMBER
add "Attempts"     NUMBER

echo "Created: ${CREATED[*]:-(none)}"
echo "Skipped (already exist): ${SKIPPED[*]:-(none)}"
echo "Next: add a Board view grouped by Stage in the browser (views cannot be created with gh)."
echo "Then record project number $NUM and owner $OWNER in SPEC.md under \"Board mirror\"."
