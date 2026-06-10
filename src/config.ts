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

/** Display names for the channels (for Slack cards and summaries). */
export const CHANNEL_LABEL: Record<Channel, string> = {
  linkedin: "LinkedIn",
  meta: "Meta",
  google: "Google",
  reddit: "Reddit",
  x: "X",
};

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
     * Real MetadataONE MCP tool names (from help.metadata.io, "Metadata MCP -
     * Supported Tools": 70 tools across 14 categories). These are the spend
     * actions the agent drives. Run `npm run probe` to confirm them against your
     * own tenant, then override here if Metadata ships a rename.
     */
    tools: {
      performance: opt("MCP_TOOL_PERFORMANCE", "performance_metrics"),
      manageCampaign: opt("MCP_TOOL_MANAGE_CAMPAIGN", "manage_campaign"),
      updateBudgets: opt("MCP_TOOL_UPDATE_BUDGETS", "update_experiments_daily_budgets"),
    },
  },

  slack: {
    botToken: req("SLACK_BOT_TOKEN"),
    appToken: req("SLACK_APP_TOKEN"),
    signingSecret: req("SLACK_SIGNING_SECRET"),
    channel: opt("SLACK_CHANNEL", "#paid-media"),
  },

  /** Public dashboard link the agent drops into Slack ("Full picture: …"). */
  dashboardUrl: opt("DASHBOARD_URL", ""),

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
