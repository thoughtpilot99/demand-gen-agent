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

You need three things: a Claude API key, a MetadataONE access token, and a Slack app.

```bash
git clone https://github.com/thoughtpilot99/demand-gen-agent
cd demand-gen-agent
npm install
cp .env.example .env
```

1. **Claude.** API key from [console.anthropic.com](https://console.anthropic.com), set `ANTHROPIC_API_KEY`.
2. **MetadataONE.** In Metadata, open **Settings, Access Token**, generate one for the MCP server, set `METADATAONE_TOKEN`.
3. **Slack.** Create an app at [api.slack.com/apps](https://api.slack.com/apps) with **Socket Mode** on. Set `SLACK_BOT_TOKEN` (`xoxb-`), `SLACK_APP_TOKEN` (`xapp-`), and `SLACK_SIGNING_SECRET`.

Map your MetadataONE tool names (they vary by tenant):

```bash
npm run probe   # lists every tool your tenant exposes; set the names in .env
```

Set your guardrails in `.env`, then bring it online:

```bash
npm run dev
```

Go to your `#paid-media` channel and message it. Ask it how you are pacing.

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
| `MCP_TOOL_*` | Names of the MetadataONE write/read tools in your tenant | run `npm run probe` |

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
- The default MetadataONE tool names are a starting point. Always confirm them with `npm run probe` against your own tenant.

## License

MIT. Built and shared by MetadataONE.
