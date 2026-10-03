#!/usr/bin/env bash
# Creates a GitHub Project with the agent-kit card fields. Run once per project, on your machine.
# Requires: gh logged in with the project scope (gh auth refresh -s project).
# Usage: scripts/gh-board-setup.sh "Project name"   (owner defaults to your own account)
set -euo pipefail
NAME="${1:?usage: gh-board-setup.sh \"Project name\"}"
OWNER="${OWNER:-@me}"

NUM=$(gh project create --owner "$OWNER" --title "$NAME" --format json -q .number)
echo "Project number: $NUM"

sel() { gh project field-create "$NUM" --owner "$OWNER" --name "$1" --data-type SINGLE_SELECT --single-select-options "$2" >/dev/null; }
txt() { gh project field-create "$NUM" --owner "$OWNER" --name "$1" --data-type TEXT >/dev/null; }
num() { gh project field-create "$NUM" --owner "$OWNER" --name "$1" --data-type NUMBER >/dev/null; }

sel "Stage"        "Backlog,Ready,In progress,Verify,Review,Done,Blocked"
sel "Priority"     "P0,P1,P2"
sel "Size"         "S,M,L"
sel "Risk"         "low,medium,high"
sel "Start tier"   "haiku,sonnet,opus"
sel "Current tier" "haiku,sonnet,opus"
txt "Card ID"
txt "Story step"
txt "Depends on"
num "Slice"
num "Attempts"

echo "Done. Open the project in the browser and add a Board view grouped by Stage (views cannot be created with gh)."
echo "The built-in Status field is not used. Stage replaces it."
echo "Project number for the lead: $NUM (owner $OWNER)"
