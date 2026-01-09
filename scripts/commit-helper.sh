#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/commit-helper.sh "feat(api): add locale to profile" \
#     "Explain why and what changed" \
#     "Refs: ABC-123"

SUBJECT="${1:-}"
BODY="${2:-}"
FOOTER="${3:-}"

if [[ -z "$SUBJECT" ]]; then
  echo "Subject required."
  exit 1
fi

git diff --staged --quiet && {
  echo "Nothing staged. Stage changes first."
  exit 1
}

TMP="$(mktemp)"
{
  echo "$SUBJECT"
  echo
  [[ -n "$BODY" ]] && echo "$BODY" && echo
  [[ -n "$FOOTER" ]] && echo "$FOOTER"
} > "$TMP"

git commit -F "$TMP"
rm -f "$TMP"
