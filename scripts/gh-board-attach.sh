#!/usr/bin/env bash
# Adds the agent-kit card fields to an EXISTING GitHub Project (v2), e.g. one made from GitHub's team planning template.
# The built-in Status field is the board column (no Stage field is created). Safe to re-run: only missing fields are created.
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
OPTS=$(gh project field-list "$NUM" --owner "$OWNER" --limit 100 --format json -q '.fields[] | select(.options) | .name as $f | .options[] | "\($f)\t\(.name)"')
CREATED=()
SKIPPED=()
WARNINGS=()

has() { grep -Fxq -- "$1" <<<"$EXISTING"; }
has_opt() { awk -F'\t' -v f="$1" -v o="$2" '$1 == f && $2 == o { found = 1 } END { exit !found }' <<<"$OPTS"; }

# 1. The Status field is the board column. It must have all five options. Nothing is changed here.
if ! has "Status"; then
  echo "Field \"Status\" not found in project $NUM. This script expects a project with the built-in Status field (e.g. from the team planning template)." >&2
  echo "For a project without it, use scripts/gh-board-setup.sh instead (creates a Stage field)." >&2
  exit 1
fi
MISSING_STATUS=()
for o in "Backlog" "Ready" "In progress" "In review" "Done"; do
  has_opt "Status" "$o" || MISSING_STATUS+=("$o")
done
if [ "${#MISSING_STATUS[@]}" -gt 0 ]; then
  echo "Status is missing option(s): $(IFS=,; echo "${MISSING_STATUS[*]}")." >&2
  echo "Add them in the browser (Project settings > Status), then re-run this script. Nothing was changed." >&2
  exit 1
fi

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

# add_or_check NAME OPTIONS: create the single select if missing; if it exists, only warn about missing options.
add_or_check() {
  local name="$1" opts="$2" o missing=()
  if ! has "$name"; then add "$name" SINGLE_SELECT "$opts"; return; fi
  SKIPPED+=("$name")
  IFS=',' read -ra want <<<"$opts"
  for o in "${want[@]}"; do has_opt "$name" "$o" || missing+=("$o"); done
  if [ "${#missing[@]}" -gt 0 ]; then
    WARNINGS+=("Field \"$name\" exists but lacks option(s): $(IFS=,; echo "${missing[*]}"). Not modified; add them in the browser if you want to use them.")
  fi
}

# 2. Kit fields (Status is the column, so there is no Stage).
add          "Kind"         SINGLE_SELECT "Map,Work,Plan"
if has "Kind" && ! has_opt "Kind" "Plan"; then
  WARNINGS+=("Field \"Kind\" exists without option \"Plan\" (needed for release plan items). gh cannot add options: in the browser open Project settings > Kind and add option \"Plan\".")
fi
add          "Blocked"      SINGLE_SELECT "yes"
add_or_check "Priority"                   "P0,P1,P2"
add_or_check "Size"                       "S,M,L"
add          "Risk"         SINGLE_SELECT "low,medium,high"
add          "Start tier"   SINGLE_SELECT "haiku,sonnet,opus"
add          "Current tier" SINGLE_SELECT "haiku,sonnet,opus"
add          "Card ID"      TEXT
add          "Story step"   TEXT
add          "Depends on"   TEXT
add          "Slice"        NUMBER
add          "Attempts"     NUMBER

echo "Status field: OK (Backlog, Ready, In progress, In review, Done)"
echo "Created: ${CREATED[*]:-(none)}"
echo "Skipped (already exist): ${SKIPPED[*]:-(none)}"
for w in "${WARNINGS[@]+"${WARNINGS[@]}"}"; do echo "WARNING: $w"; done
echo "Next, in the browser (views cannot be created with gh):"
echo "  1. Work view(s): set filter  -kind:Map  so map cards stay out of the work board."
echo "  2. Create view \"Map\": Board layout, filter  kind:Map , group by Activity (the Activity field is created by scripts/gh-board-map.sh)."
echo "  3. Record project number $NUM and owner $OWNER in SPEC.md under \"Board mirror\"."
