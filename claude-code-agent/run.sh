#!/usr/bin/env bash
# Run one routine headless on your Claude subscription (no API key).
#   ./run.sh inbox            check Slack for instructions and act
#   ./run.sh pacing-watch     intraday CPL watch
#   ./run.sh weekly-readout   weekly summary to Slack
set -euo pipefail
cd "$(dirname "$0")"

# Load operator config: tokens feed .mcp.json, guardrails feed the prompt.
set -a; [ -f .env ] && . ./.env; set +a

ROUTINE="${1:-inbox}"
PROMPT_FILE="routines/${ROUTINE}.md"
[ -f "$PROMPT_FILE" ] || { echo "Unknown routine '$ROUTINE'. Try: inbox, pacing-watch, weekly-readout"; exit 1; }

CONFIG="Operator config for this run. \
Slack channel: ${SLACK_CHANNEL:-#paid-media}. \
Auto-approve budget moves at or under \$${AUTO_APPROVE_DAILY_USD:-2000} per day; anything larger, post to Slack and wait for a reply. \
Never propose a single move above \$${MAX_DAILY_SHIFT_USD:-20000} per day. \
CPL ceiling: \$${CPL_CEILING_USD:-140}. \
Dashboard link: ${DASHBOARD_URL:-none set}."

# --mcp-config loads the project servers for headless runs (no interactive
# approval gate). --allowedTools lets the MCP tools run without prompting. If
# your Claude Code build does not honor the wildcards, swap the --allowedTools
# line for: --permission-mode bypassPermissions
exec claude -p "$(cat "$PROMPT_FILE")" \
  --mcp-config .mcp.json \
  --append-system-prompt "$CONFIG" \
  --allowedTools "mcp__metadataone__*" "mcp__slack__*" "Read" "Write" "Bash" \
  --output-format text
