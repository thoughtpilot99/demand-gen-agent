# Demand Gen Agent · Claude Code build (subscription, no API)

The subscription-native build. It runs the agent on **Claude Code** using your **Claude Pro/Max plan** (no Anthropic API key, no per-token billing). All ad work goes through **MetadataONE's MCP**; Slack is a second MCP for posting and reading.

On a schedule, it:
- **Watches pacing** intraday and posts an alert to Slack when a channel crosses your CPL ceiling, then handles it inside your guardrails.
- **Posts a weekly readout** to Slack.
- **Takes instructions from Slack** by messaging the channel ("shift $3k/day Meta to LinkedIn"); it acts, then replies.

> This runs Claude on a schedule, so it realistically wants a **Max** plan (a 24/7 watcher uses plan usage) and a small always-on machine to run the cron.

## Setup

1. **Install Claude Code and log in with your subscription** (no API key):
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude login        # pick your Pro/Max subscription
   ```
2. **Fill in `.env`:**
   ```bash
   cp .env.example .env
   ```
   - `METADATAONE_TOKEN`: Metadata, Settings, Access Token, Generate Access Token for MCP Server.
   - `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID`: create a Slack app (bot scopes `chat:write`, `channels:history`, `channels:read`), install it, invite it to your channel.
   - Set your guardrails (`AUTO_APPROVE_DAILY_USD`, `CPL_CEILING_USD`) and `DASHBOARD_URL`.
3. **Approve the servers once.** Run `claude` here interactively, approve the `metadataone` and `slack` servers, and try: *"Which account am I connected with? Then check today's pacing."*
4. **Test a routine headless:**
   ```bash
   ./run.sh inbox
   ./run.sh pacing-watch
   ```
5. **Schedule it.** Copy `crontab.example` into `crontab -e` (point `AGENT` at this folder), or use Claude Code's own scheduling.

## How it stays no-API
Claude Code runs against your subscription, not the API. `.mcp.json` wires Claude to MetadataONE (HTTP, your token) and Slack (stdio). `run.sh` runs each routine headless (`claude -p`) with those tools allowed and your guardrails injected. The agent's brain lives in `CLAUDE.md`.

## Inbound: polling vs push
Out of the box, the `inbox` routine **polls** Slack on a short interval (reads new messages, acts, replies). That needs no public endpoint. For near-instant inbound, advanced users can push Slack messages into a live session with a Claude Code **channel** instead of polling (see Claude Code's Channels docs). Either way, no Anthropic API.

## The approval flow
Big budget moves are not auto-executed. The agent posts the move to Slack and asks you to **reply `approve` or `hold`**. The next `inbox` run reads your reply and carries it out. (Clickable Approve/Hold buttons that execute on tap need a public endpoint; that is the API/Socket-Mode build in the parent repo.)

## Files
- `CLAUDE.md`: the agent's persona, guardrails, and Slack card shapes.
- `.mcp.json`: MetadataONE + Slack MCP servers.
- `routines/`: the three prompts (`pacing-watch`, `weekly-readout`, `inbox`).
- `run.sh`: headless runner: `./run.sh <routine>`.
- `crontab.example`: the schedule.
