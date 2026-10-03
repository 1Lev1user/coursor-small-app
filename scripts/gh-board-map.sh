#!/usr/bin/env bash
# Mirrors PROJECT_MAP.json to an EXISTING GitHub Project (v2) as "map" cards (Kind=Map, Status=Done).
# One draft item per map entry, titled "M-S4.1 <title>". Safe to re-run: items whose title exists are skipped.
# Never deletes or edits other items. If a run stops half-way, delete the half-made card in the browser and re-run.
# Requires: gh logged in with the project scope (gh auth refresh -s project), node. Run scripts/gh-board-attach.sh first.
# Usage: scripts/gh-board-map.sh <project-number>   (owner defaults to @me; override with OWNER=...)
set -euo pipefail
NUM="${1:?usage: gh-board-map.sh <project-number>}"
OWNER="${OWNER:-@me}"
MAP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/PROJECT_MAP.json"

ACTIVITIES='Sets up,Records entries,Reviews money,Imports bank statement,Plans and saves,Backs up and updates'

[ -f "$MAP" ] || { echo "PROJECT_MAP.json not found at $MAP" >&2; exit 1; }

if ! PID=$(gh project view "$NUM" --owner "$OWNER" --format json -q .id 2>/dev/null) || [ -z "$PID" ]; then
  echo "Project $NUM not found for owner $OWNER (or gh lacks the project scope: gh auth refresh -s project)." >&2
  exit 1
fi

# Map file access: item IDX KEY  (title | activity | step | files | body); count
item() {
  node -e '
    const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const [idx, key] = [process.argv[2], process.argv[3]];
    if (idx === "count") { console.log(m.items.length); process.exit(0); }
    const i = m.items[Number(idx)];
    const bullets = (a) => (a.length ? a.map((x) => "- `" + x + "`").join("\n") : "- (none)");
    const out = {
      title: `${i.id} ${i.title}`,
      activity: i.activity,
      step: i.story_step,
      files: i.files.join(", "),
      body: `**What**\n${i.what}\n\n**Where in the app**\n${i.where_in_app}\n\n**Files**\n${bullets(i.files)}\n\n**Tests**\n${bullets(i.tests)}`
        + (i.notes ? `\n\n**Notes**\n${i.notes}` : "") + `\n\nStory step: ${i.story_step}. Mirrored from PROJECT_MAP.json; edit the file, not this card.`,
    };
    process.stdout.write(out[key]);
  ' "$MAP" "$1" "${2:-}"
}

# Field lookups, reloaded after fields are created.
load_fields() {
  FIELD_IDS=$(gh project field-list "$NUM" --owner "$OWNER" --limit 100 --format json -q '.fields[] | "\(.name)\t\(.id)"')
  FIELD_OPTS=$(gh project field-list "$NUM" --owner "$OWNER" --limit 100 --format json -q '.fields[] | select(.options) | .name as $f | .options[] | "\($f)\t\(.name)\t\(.id)"')
}
field_id() { awk -F'\t' -v f="$1" '$1 == f { print $2; exit }' <<<"$FIELD_IDS"; }
opt_id() { awk -F'\t' -v f="$1" -v o="$2" '$1 == f && $2 == o { print $3; exit }' <<<"$FIELD_OPTS"; }
opt_count() { awk -F'\t' -v f="$1" '$1 == f { n++ } END { print n + 0 }' <<<"$FIELD_OPTS"; }

load_fields
for need in "Status" "Story step"; do
  if [ -z "$(field_id "$need")" ]; then
    echo "Field \"$need\" is missing. Run scripts/gh-board-attach.sh $NUM first." >&2
    exit 1
  fi
done

# 1. Ensure the map fields exist (only missing ones are created).
CREATED=()
ensure() { # NAME TYPE [OPTIONS]
  local name="$1" type="$2" opts="${3:-}"
  [ -n "$(field_id "$name")" ] && return 0
  if [ -n "$opts" ]; then
    gh project field-create "$NUM" --owner "$OWNER" --name "$name" --data-type "$type" --single-select-options "$opts" >/dev/null
  else
    gh project field-create "$NUM" --owner "$OWNER" --name "$name" --data-type "$type" >/dev/null
  fi
  CREATED+=("$name")
}
ensure "Kind"     SINGLE_SELECT "Map,Work"
ensure "Activity" SINGLE_SELECT "$ACTIVITIES"
ensure "Files"    TEXT
load_fields

if [ "$(opt_count Activity)" -ne 6 ]; then
  echo "Field Activity has $(opt_count Activity) options, expected 6. Fix its options in the browser, then re-run." >&2
  exit 1
fi

KIND_ID=$(field_id Kind);   KIND_MAP=$(opt_id Kind Map)
STATUS_ID=$(field_id Status); STATUS_DONE=$(opt_id Status Done)
ACT_ID=$(field_id Activity)
STEP_ID=$(field_id "Story step")
FILES_ID=$(field_id Files)
for v in KIND_ID KIND_MAP STATUS_ID STATUS_DONE ACT_ID STEP_ID FILES_ID; do
  [ -n "${!v}" ] || { echo "Could not resolve $v (Kind needs option Map, Status needs option Done)." >&2; exit 1; }
done

# 2. Create missing map cards.
EXISTING=$(gh project item-list "$NUM" --owner "$OWNER" --limit 1000 --format json -q '.items[].title')
COUNT=$(item count)
MADE=0
SKIPPED=0
for ((n = 0; n < COUNT; n++)); do
  TITLE=$(item "$n" title)
  if grep -Fxq -- "$TITLE" <<<"$EXISTING"; then SKIPPED=$((SKIPPED + 1)); continue; fi
  ACT=$(item "$n" activity)
  ACT_OPT=$(opt_id Activity "$ACT")
  [ -n "$ACT_OPT" ] || { echo "$TITLE: activity \"$ACT\" is not an option of the Activity field." >&2; exit 1; }
  ID=$(gh project item-create "$NUM" --owner "$OWNER" --title "$TITLE" --body "$(item "$n" body)" --format json -q .id)
  gh project item-edit --id "$ID" --project-id "$PID" --field-id "$KIND_ID"  --single-select-option-id "$KIND_MAP" >/dev/null
  gh project item-edit --id "$ID" --project-id "$PID" --field-id "$STATUS_ID" --single-select-option-id "$STATUS_DONE" >/dev/null
  gh project item-edit --id "$ID" --project-id "$PID" --field-id "$ACT_ID"   --single-select-option-id "$ACT_OPT" >/dev/null
  gh project item-edit --id "$ID" --project-id "$PID" --field-id "$STEP_ID"  --text "$(item "$n" step)" >/dev/null
  gh project item-edit --id "$ID" --project-id "$PID" --field-id "$FILES_ID" --text "$(item "$n" files)" >/dev/null
  MADE=$((MADE + 1))
  echo "Created: $TITLE"
done

echo "Fields created: ${CREATED[*]:-(none)}"
echo "Map cards created: $MADE, skipped (title already exists): $SKIPPED, total in PROJECT_MAP.json: $COUNT"
echo "Manual step (views cannot be created with gh), in the browser:"
echo "  1. New view \"Map\": Board layout, filter  kind:Map , group by Activity."
echo "  2. Work view(s): set filter  -kind:Map  so map cards stay out of the work board."
echo "Map cards are not counted in WIP or metrics."
