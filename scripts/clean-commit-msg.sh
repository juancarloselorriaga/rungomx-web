#!/usr/bin/env bash
set -euo pipefail

# commit-msg hooks pass the commit message file path as $1.
# Fallback keeps the script safe when invoked directly by tooling.
MSG_FILE="${1:-.git/COMMIT_EDITMSG}"

if [[ ! -f "$MSG_FILE" ]]; then
  echo "[clean-commit-msg] Commit message file not found: $MSG_FILE" >&2
  exit 0
fi

# Block or strip common AI attribution patterns.
# You can choose either "strip" (default here) or "fail".

MODE="${CLEAN_COMMIT_MODE:-strip}"  # set to "fail" to hard-block

PATTERNS=(
  'Generated with'
  'Claude Code'
  '^Co-Authored-By:.*'
  '^Co-authored-by:.*'
)

if [[ "$MODE" == "strip" ]]; then
  # Remove attribution/footer lines without stripping normal tool-name mentions.
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
