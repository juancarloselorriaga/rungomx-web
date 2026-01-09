#!/usr/bin/env bash
set -euo pipefail

MSG_FILE="$1"

# Block or strip common AI attribution patterns.
# You can choose either "strip" (default here) or "fail".

MODE="${CLEAN_COMMIT_MODE:-strip}"  # set to "fail" to hard-block

PATTERNS=(
  'Generated with'
  'Claude Code'
  'Anthropic'
  'Codex'
  '^Co-Authored-By:.*'
  '^Co-authored-by:.*'
)

if [[ "$MODE" == "strip" ]]; then
  # Remove matching lines
  for p in "${PATTERNS[@]}"; do
    # macOS and Linux compatible sed
    perl -0777 -i -pe "s/^.*$p.*\n//gmi" "$MSG_FILE"
  done
else
  # Hard fail if found
  for p in "${PATTERNS[@]}"; do
    if perl -ne "exit 1 if /$p/i" "$MSG_FILE"; then
      :
    else
      echo "ERROR: Commit message contains disallowed AI attribution: $p" >&2
      exit 1
    fi
  done
fi

exit 0
