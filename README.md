# Demand Gen Agent

A demand gen agent that runs on **Claude**, manages your ad spend across **LinkedIn, Meta, Google, Reddit and X** through **MetadataONE's MCP**, and talks to your team in **Slack**.

You talk to it like a teammate. Ask what is working, tell it to shift budget, and it does the job across every channel. It pings you in Slack when something needs your eyes, and there is a live dashboard when you want the full picture. Most paid teams find out a campaign went sideways days after the money was gone. This one watches the spend as it happens and flags it before it hurts.

**Wire it up once and you stop opening ad managers.**

## What it does

1. **Runs on Claude**, wired to your LinkedIn, Meta, Google, Reddit and X ad accounts through MetadataONE's MCP. One connection, all five channels.
2. **Manages spend day to day:** rebids the auctions worth winning, pauses the losers, moves budget toward whatever is returning pipeline.
3. **Lives in your Slack,** so you run paid by messaging it and approve the big moves in a thread.
4. **Pushes alerts and a weekly readout into Slack,** with a live dashboard for spend, CPL, and pipeline by channel.

## Three ways to run it

All three do the ad work through **MetadataONE's MCP**. They differ only in how Claude itself is run.

### 1. Your Claude subscription, no API (anyone on Claude Pro)
Connect MetadataONE to your Claude with the **MCP custom connector**, and turn on Metadata's own **Slack alerts** (in Metadata: Settings, Integrations, Slack). Run paid by chatting with your Claude; Metadata pushes alerts to Slack on its own. Nothing to deploy, no key to buy. This is the path the [guide](https://demand-gen-agent-zeta.vercel.app) walks you through.

### 2. Autonomous, still no API (Claude Max) → [`claude-code-agent/`](claude-code-agent/README.md)
The agent runs on **Claude Code** against your Max plan. A scheduled routine watches pacing intraday, posts alerts and a weekly readout to Slack, and takes the instructions you message into the channel. No API key, no per-token billing. This is the full "lives in Slack, watches as it happens" experience on your subscription. See [`claude-code-agent/`](claude-code-agent/README.md).

### 3. API / Socket-Mode bot, pay-per-token → [`src/`](src/)
The TypeScript/Node version documented below. Use this if you want **instant** two-way Slack (clickable Approve and Hold buttons via Socket Mode) and do not mind paying Anthropic API tokens for the reasoning.

## How it works

The agent **reads** your live numbers straight from MetadataONE. When it wants to change spend, every **write** goes through guardrails: rebids and pauses are day-to-day, budget moves above your auto-approve limit wait for a human sign-off. Metadata's own rule is baked in: always use read-only tools first to validate before any change.

```
you (chat or Slack) ─▶ Claude ─▶ reads MetadataONE (MCP)
                          │
                          ├─ small move  ─▶ executes, reports back
                          └─ big move     ─▶ waits for your approval ─▶ executes
```

---

# Tier 3: the API / Socket-Mode build (`src/`)

The Node version. This is the only tier that uses the Anthropic API (for the reasoning) and gives you instant clickable Approve/Hold buttons in Slack via Socket Mode.

## Quickstart

Two ways to run it, both one command. Either way you need three keys: a Claude **API** key, a MetadataONE access token, and a Slack app.

```bash
git clone https://github.com/thoughtpilot99/demand-gen-agent
cd demand-gen-agent

# Option A: npm (Node 20+). Interactive setup scaffolds .env and validates every key
npm install && npm run setup && npm run dev

# Option B: Docker (no local Node). Fill .env, then up
cp .env.example .env && docker compose up
```

`npm run setup` walks you through each key, writes `.env`, then checks them live: it pings Claude, opens the MetadataONE MCP connection and counts your tools, and confirms the Slack auth. The three keys:

1. **Claude.** API key from [console.anthropic.com](https://console.anthropic.com), set `ANTHROPIC_API_KEY`. (Tiers 1 and 2 use your subscription instead and need no key.)
2. **MetadataONE.** You must be an account admin. In Metadata, open **Settings, Access Token, Generate Access Token for MCP Server**, accept the warning, copy it, and set `METADATAONE_TOKEN`. Server URL is `https://mcp-server.metadata.io/mcp`.
3. **Slack.** Create an app at [api.slack.com/apps](https://api.slack.com/apps) with **Socket Mode** on. Set `SLACK_BOT_TOKEN` (`xoxb-`), `SLACK_APP_TOKEN` (`xapp-`), and `SLACK_SIGNING_SECRET`.

The defaults are the real MetadataONE tool names. Confirm them against your tenant with `npm run probe`, then invite the app to your channel and message it.

### Slack app scopes
Bot token scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`. Subscribe to the `app_mention` and `message.im` events. Turn on **Interactivity** so the Approve / Hold buttons work.

## Configuration

| Variable | What it does | Default |
| --- | --- | --- |
| `AUTO_APPROVE_DAILY_USD` | Budget moves at or under this run on their own | `2000` |
| `MAX_DAILY_SHIFT_USD` | Hard ceiling; never proposes a single move above it | `20000` |
| `CPL_CEILING_USD` | When a channel crosses this CPL, the guard kicks in | `140` |
| `DASHBOARD_URL` | Dashboard link the agent drops into Slack | (blank) |
| `PACING_CRON` | How often the intraday watch runs | `*/15 7-19 * * 1-5` |
| `WEEKLY_CRON` | When the weekly readout posts | `0 9 * * 1` |
| `MCP_TOOL_PERFORMANCE` / `MCP_TOOL_MANAGE_CAMPAIGN` / `MCP_TOOL_UPDATE_BUDGETS` | Real MetadataONE tool names | confirm via `npm run probe` |

## Project layout

```
claude-code-agent/   Tier 2: the subscription build (Claude Code, no API)
src/                 Tier 3: the API / Socket-Mode bot
  index.ts           Boots Slack + schedules the jobs
  agent.ts           Claude loop: MetadataONE reads + guarded write tools
  metadata.ts        MCP client for MetadataONE (writes + the probe)
  guardrails.ts      Auto-approve vs. Slack approval, the pending-move store
  slack.ts           Bolt app: messages, alerts, Approve / Hold cards
  prompts.ts         The teammate persona and operating rules
  jobs/              Intraday pacing watch + weekly readout
site/                The live dashboard + the interactive build guide (Vercel)
```

## The dashboard

`site/` holds a live cross-channel dashboard and the interactive guide. Deploy it to Vercel for a shareable link:

```bash
cd site && npx vercel deploy --prod
```

The guide serves at `/`, the dashboard at `/dashboard`.

## Before you run it on real spend

- The default tool names are the real MetadataONE names (`performance_metrics`, `manage_campaign`, `update_experiments_daily_budgets`, out of 70 tools across 14 categories). Confirm with `npm run probe`.
- The approval queue is in memory so this stays a single thing to run. Back it with Redis or a table before production so a restart never drops a pending move.
- Start with a low `AUTO_APPROVE_DAILY_USD` and watch a few cycles before you loosen it.

## License

MIT. Built and shared by MetadataONE.
