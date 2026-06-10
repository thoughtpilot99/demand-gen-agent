# Demand Gen Agent

A demand gen agent that runs on Claude, manages your ad spend across **LinkedIn, Meta, Google, Reddit and X** through **MetadataONE's MCP**, and lives in your **Slack**.

You talk to it like a teammate. Ask what is working, tell it to shift budget, and it does the job across every channel. It pings you in Slack when something needs your eyes, and there is a live dashboard when you want the full picture. Most paid teams find out a campaign went sideways days after the money was gone. This one watches the spend as it happens and flags it before it hurts.

**Wire it up once and you stop opening ad managers.**

---

## What it does

1. **Runs on Claude**, wired to your LinkedIn, Meta, Google, Reddit and X ad accounts through MetadataONE's MCP. One connection, all five channels.
2. **Manages spend day to day:** rebids the auctions worth winning, pauses the losers, moves budget toward whatever is returning pipeline.
3. **Lives in your Slack,** so you run paid by messaging it and approve the big moves in a thread.
4. **Pushes alerts and a weekly readout into Slack,** with a live dashboard for spend, CPL, and pipeline by channel.

## How it works

The agent **reads** your live numbers straight from MetadataONE through Claude's MCP connector. When it wants to change spend, it does not just do it. Every **write** goes through three guarded tools (`pause_ad_sets`, `rebid`, `move_budget`) where your auto-approve limit and the Slack sign-off are enforced in code. The mutating MetadataONE tools are denied to the connector on purpose, so the model proposes and your rules decide.

```
Slack message ─▶ Claude (Opus 4.8) ─▶ reads MetadataONE (MCP connector)
                        │
                        ├─ small move  ─▶ executes, reports back in Slack
                        └─ big move     ─▶ Approve / Hold card in Slack ─▶ executes on click
```

Two scheduled jobs run alongside the chat: an **intraday pacing watch** that catches a CPL spike the moment it crosses your ceiling, and a **weekly readout** posted to Slack.

## Quickstart

Two ways to run it, both one command. Either way you need three keys: a Claude API key, a MetadataONE access token, and a Slack app.

```bash
git clone https://github.com/thoughtpilot99/demand-gen-agent
cd demand-gen-agent

# Option A: npm (Node 20+). Interactive setup scaffolds .env and validates every key
npm install && npm run setup && npm run dev

# Option B: Docker (no local Node). Fill .env, then up
cp .env.example .env && docker compose up
```

`npm run setup` walks you through each key, writes `.env`, then checks them live: it pings Claude, opens the MetadataONE MCP connection and counts your tools, and confirms the Slack auth. Green across the board means you are ready. The three keys:

1. **Claude.** API key from [console.anthropic.com](https://console.anthropic.com), set `ANTHROPIC_API_KEY`.
2. **MetadataONE.** You must be an account admin. In Metadata, open **Settings → Access Token → Generate Access Token for MCP Server**, accept the security warning, copy it, and set `METADATAONE_TOKEN`. The server URL is `https://mcp-server.metadata.io/mcp` (already the default). This is the same token Metadata's own "connect to Claude" guide uses ([help.metadata.io](https://help.metadata.io/portal/articles/metadata-mcp-how-to-connect)); the difference is this agent passes it over the API so it can run in Slack and on a schedule, instead of you connecting it to the Claude app by hand.
3. **Slack.** Create an app at [api.slack.com/apps](https://api.slack.com/apps) with **Socket Mode** on. Set `SLACK_BOT_TOKEN` (`xoxb-`), `SLACK_APP_TOKEN` (`xapp-`), and `SLACK_SIGNING_SECRET`.

The defaults are the real MetadataONE tool names. To confirm them against your tenant, run `npm run probe` (it lists every tool you can invoke). Then go to your `#paid-media` channel, invite the app with `/invite @your-app`, and message it. Ask it how you are pacing.

### Slack app scopes

Bot token scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`. Subscribe to the `app_mention` and `message.im` events. Turn on **Interactivity** (Socket Mode handles the request URL) so the Approve / Hold buttons work.

## Configuration

Everything is in `.env` (see `.env.example`).

| Variable | What it does | Default |
| --- | --- | --- |
| `AUTO_APPROVE_DAILY_USD` | Budget moves at or under this run on their own | `2000` |
| `MAX_DAILY_SHIFT_USD` | Hard ceiling; never proposes a single move above it | `20000` |
| `CPL_CEILING_USD` | When a channel crosses this CPL, the guard kicks in | `140` |
| `PACING_CRON` | How often the intraday watch runs | `*/15 7-19 * * 1-5` |
| `WEEKLY_CRON` | When the weekly readout posts | `0 9 * * 1` |
| `MCP_TOOL_PERFORMANCE` / `MCP_TOOL_MANAGE_CAMPAIGN` / `MCP_TOOL_UPDATE_BUDGETS` | Real MetadataONE tool names (`performance_metrics`, `manage_campaign`, `update_experiments_daily_budgets`) | confirm via `npm run probe` |

## Project layout

```
src/
  index.ts          Boots Slack + schedules the jobs
  agent.ts          Claude loop: MetadataONE reads + guarded write tools
  metadata.ts       MCP client for MetadataONE (writes + the probe)
  guardrails.ts     Auto-approve vs. Slack approval, the pending-move store
  slack.ts          Bolt app: messages, alerts, Approve / Hold cards
  prompts.ts        The teammate persona and operating rules
  config.ts         Env and guardrail config
  jobs/
    pacing-watch.ts   Intraday CPL watch
    weekly-readout.ts Weekly Slack summary
site/               The live dashboard + this build guide (deploy to Vercel)
scripts/
  probe-tools.ts    Lists your MetadataONE MCP tools
```

## The dashboard

`site/` holds a live cross-channel dashboard (spend, CPL, pipeline by channel) and the build guide. Deploy it to Vercel in one push for a shareable link, separate from the chat:

```bash
cd site && npx vercel deploy --prod
```

The guide serves at `/`, the dashboard at `/dashboard`.

## Before you run it on real spend

- The approval queue is in memory so this stays a single thing to run. Back it with Redis or a table before production so a restart never drops a pending move (one swap in `src/guardrails.ts`).
- Start with a low `AUTO_APPROVE_DAILY_USD` and watch a few cycles before you loosen it.
- The default tool names are the real MetadataONE names (`performance_metrics`, `manage_campaign`, `update_experiments_daily_budgets`, out of 70 tools across 14 categories). Confirm them with `npm run probe` against your own tenant in case Metadata ships a rename.

## License

MIT. Built and shared by MetadataONE.
