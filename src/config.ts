import "dotenv/config";

/**
 * Central config. Everything the agent needs comes from the environment so the
 * same build runs against any tenant. See .env.example for what each value is.
 */

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v.trim();
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** The five channels the agent runs, exactly as named in the post. */
export const CHANNELS = ["linkedin", "meta", "google", "reddit", "x"] as const;
export type Channel = (typeof CHANNELS)[number];

export const config = {
  anthropic: {
    apiKey: req("ANTHROPIC_API_KEY"),
    model: opt("AGENT_MODEL", "claude-opus-4-8"),
    effort: opt("AGENT_EFFORT", "high"),
  },

  metadata: {
    mcpUrl: opt("METADATAONE_MCP_URL", "https://mcp-server.metadata.io/mcp"),
    token: req("METADATAONE_TOKEN"),
    /**
     * Tool names on your MetadataONE MCP server. Defaults are a starting point;
     * run `npm run probe` to list the real ones in your tenant and set them here.
     */
    tools: {
      getPerformance: opt("MCP_TOOL_GET_PERFORMANCE", "get_performance"),
      pause: opt("MCP_TOOL_PAUSE", "pause_ad_set"),
      setBid: opt("MCP_TOOL_SET_BID", "update_bid"),
      moveBudget: opt("MCP_TOOL_MOVE_BUDGET", "move_budget"),
    },
  },

  slack: {
    botToken: req("SLACK_BOT_TOKEN"),
    appToken: req("SLACK_APP_TOKEN"),
    signingSecret: req("SLACK_SIGNING_SECRET"),
    channel: opt("SLACK_CHANNEL", "#paid-media"),
  },

  guardrails: {
    /** Budget moves at or under this daily $ amount execute automatically. */
    autoApproveDailyUsd: num("AUTO_APPROVE_DAILY_USD", 2000),
    /** The agent will never propose a single move larger than this. */
    maxDailyShiftUsd: num("MAX_DAILY_SHIFT_USD", 20000),
    /** When a channel's CPL crosses this, the guard tightens. */
    cplCeilingUsd: num("CPL_CEILING_USD", 140),
  },

  schedule: {
    pacingCron: opt("PACING_CRON", "*/15 7-19 * * 1-5"),
    weeklyCron: opt("WEEKLY_CRON", "0 9 * * 1"),
    timezone: opt("TIMEZONE", "America/New_York"),
  },
} as const;

export type Config = typeof config;
