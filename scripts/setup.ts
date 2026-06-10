import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * One-command setup. Walks you through every key, writes .env, then validates
 * each one live: pings Claude, opens the MetadataONE MCP connection and counts
 * your tools, and confirms the Slack auth. Green across the board means you are
 * ready to `npm run dev`.
 *
 *   npm run setup
 *
 * Self-contained on purpose: it does not import the app's config (which would
 * throw on a half-filled .env), so you can run it before anything is set.
 */

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", orange: "\x1b[38;5;208m", cyan: "\x1b[36m",
};
const ok = (s: string) => `${c.green}✓${c.reset} ${s}`;
const bad = (s: string) => `${c.red}✗${c.reset} ${s}`;
const warn = (s: string) => `${c.yellow}!${c.reset} ${s}`;

interface Field { key: string; label: string; secret?: boolean; def?: string; hint?: string }

const FIELDS: Field[] = [
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API key", secret: true, hint: "console.anthropic.com" },
  { key: "METADATAONE_TOKEN", label: "MetadataONE access token", secret: true, hint: "Metadata → Settings → Access Token → Generate for MCP Server" },
  { key: "SLACK_BOT_TOKEN", label: "Slack bot token (xoxb-)", secret: true },
  { key: "SLACK_APP_TOKEN", label: "Slack app token (xapp-)", secret: true },
  { key: "SLACK_SIGNING_SECRET", label: "Slack signing secret", secret: true },
  { key: "SLACK_CHANNEL", label: "Slack channel", def: "#paid-media" },
  { key: "AUTO_APPROVE_DAILY_USD", label: "Auto-approve limit ($/day)", def: "2000" },
  { key: "CPL_CEILING_USD", label: "CPL ceiling ($)", def: "140" },
];

const FIXED: Record<string, string> = {
  AGENT_MODEL: "claude-opus-4-8",
  AGENT_EFFORT: "high",
  METADATAONE_MCP_URL: "https://mcp-server.metadata.io/mcp",
  MCP_TOOL_PERFORMANCE: "performance_metrics",
  MCP_TOOL_MANAGE_CAMPAIGN: "manage_campaign",
  MCP_TOOL_UPDATE_BUDGETS: "update_experiments_daily_budgets",
  MAX_DAILY_SHIFT_USD: "20000",
  PACING_CRON: "*/15 7-19 * * 1-5",
  WEEKLY_CRON: "0 9 * * 1",
  TIMEZONE: "America/New_York",
};

function parseEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] && !m[1].startsWith("#")) out[m[1]] = m[2] ?? "";
  }
  return out;
}

function mask(v: string): string {
  if (!v) return "";
  return v.length <= 8 ? "•".repeat(v.length) : v.slice(0, 4) + "…" + v.slice(-3);
}

async function main() {
  console.log(`\n${c.orange}${c.bold}Demand Gen Agent · setup${c.reset}\n${c.dim}Fill what you have. Press Enter to keep an existing value.${c.reset}\n`);

  const envPath = new URL("../.env", import.meta.url).pathname;
  const current = parseEnv(envPath);
  const rl = createInterface({ input: stdin, output: stdout });
  const values: Record<string, string> = { ...FIXED, ...current };

  for (const f of FIELDS) {
    const existing = current[f.key] || "";
    const shown = existing ? ` ${c.dim}[${f.secret ? mask(existing) : existing}]${c.reset}` : f.def ? ` ${c.dim}[${f.def}]${c.reset}` : "";
    const hint = f.hint ? ` ${c.dim}(${f.hint})${c.reset}` : "";
    const ans = (await rl.question(`${c.cyan}${f.label}${c.reset}${hint}${shown}: `)).trim();
    values[f.key] = ans || existing || f.def || "";
  }
  rl.close();

  // write .env preserving a readable order
  const order = ["ANTHROPIC_API_KEY", "AGENT_MODEL", "AGENT_EFFORT", "METADATAONE_MCP_URL", "METADATAONE_TOKEN",
    "MCP_TOOL_PERFORMANCE", "MCP_TOOL_MANAGE_CAMPAIGN", "MCP_TOOL_UPDATE_BUDGETS",
    "SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_SIGNING_SECRET", "SLACK_CHANNEL",
    "AUTO_APPROVE_DAILY_USD", "MAX_DAILY_SHIFT_USD", "CPL_CEILING_USD",
    "PACING_CRON", "WEEKLY_CRON", "TIMEZONE"];
  const body = order.map((k) => `${k}=${values[k] ?? ""}`).join("\n") + "\n";
  writeFileSync(envPath, body);
  console.log(`\n${ok(`Wrote ${c.bold}.env${c.reset}`)}\n\n${c.bold}Validating...${c.reset}\n`);

  let allGood = true;

  // 1. Claude
  try {
    const anthropic = new Anthropic({ apiKey: values.ANTHROPIC_API_KEY });
    await anthropic.models.retrieve(values.AGENT_MODEL || "claude-opus-4-8");
    console.log(ok(`Claude:key works, ${values.AGENT_MODEL} reachable`));
  } catch (e: any) {
    allGood = false;
    console.log(bad(`Claude:${e?.message || e}`));
  }

  // 2. MetadataONE MCP
  try {
    const transport = new StreamableHTTPClientTransport(new URL(values.METADATAONE_MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${values.METADATAONE_TOKEN}` } },
    });
    const client = new Client({ name: "demand-gen-agent-setup", version: "1.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    await client.close();
    const have = tools.map((t) => t.name);
    console.log(ok(`MetadataONE:connected, ${c.bold}${have.length}${c.reset} tools available`));
    for (const [label, name] of [["pause/rebid", values.MCP_TOOL_MANAGE_CAMPAIGN], ["budget", values.MCP_TOOL_UPDATE_BUDGETS], ["read", values.MCP_TOOL_PERFORMANCE]] as const) {
      console.log(have.includes(name) ? `   ${ok(`${name} (${label})`)}` : `   ${warn(`${name} (${label}) not found. Set MCP_TOOL_* in .env to a real name from the list`)}`);
    }
  } catch (e: any) {
    allGood = false;
    console.log(bad(`MetadataONE:${e?.message || e}`));
  }

  // 3. Slack
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${values.SLACK_BOT_TOKEN}` },
    });
    const data: any = await res.json();
    if (data.ok) console.log(ok(`Slack:authed as ${c.bold}${data.user}${c.reset} in ${data.team}`));
    else { allGood = false; console.log(bad(`Slack:${data.error}`)); }
  } catch (e: any) {
    allGood = false;
    console.log(bad(`Slack:${e?.message || e}`));
  }

  console.log(
    allGood
      ? `\n${c.green}${c.bold}Ready.${c.reset} Run ${c.bold}npm run dev${c.reset} (or ${c.bold}docker compose up${c.reset}) and message it in Slack.\n`
      : `\n${c.yellow}Some checks failed.${c.reset} Fix the lines above, then run ${c.bold}npm run setup${c.reset} again.\n`,
  );
  process.exit(allGood ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
