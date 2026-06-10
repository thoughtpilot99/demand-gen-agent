import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config, type Channel } from "./config.js";

/**
 * MetadataONE write/execution client.
 *
 * Reads (what's working, CPL by channel) flow through Claude's MCP connector,
 * which Claude pulls itself while it reasons. But every *change* to spend
 * (pause, rebid, move budget) goes through this client instead, so the
 * guardrails and the Slack approval gate are enforced in our code, not left to
 * the model. The mutating tools are denylisted from the connector for the same
 * reason: the model proposes, this layer executes.
 *
 * It speaks MCP over Streamable HTTP to the same MetadataONE server, authed with
 * your access token.
 */

let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;
  const transport = new StreamableHTTPClientTransport(new URL(config.metadata.mcpUrl), {
    requestInit: {
      headers: { Authorization: `Bearer ${config.metadata.token}` },
    },
  });
  const c = new Client({ name: "demand-gen-agent", version: "1.0.0" });
  await c.connect(transport);
  client = c;
  return c;
}

/** List every tool the connected MetadataONE tenant exposes. Used by `npm run probe`. */
export async function listTools(): Promise<{ name: string; description?: string }[]> {
  const c = await getClient();
  const { tools } = await c.listTools();
  return tools.map((t) => ({ name: t.name, description: t.description }));
}

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const c = await getClient();
  const res = await c.callTool({ name, arguments: args });
  if (res.isError) {
    throw new Error(`MetadataONE tool ${name} failed: ${JSON.stringify(res.content)}`);
  }
  return res.content;
}

// ── Performance read (used by the scheduled jobs to spot trouble) ────────────

export interface ChannelMetrics {
  channel: Channel;
  spend: number;
  cpl: number;
  pipelinePerDollar: number;
}

/**
 * Pull the last `windowHours` of performance per channel. Shape varies by
 * tenant, so we normalize defensively. The scheduled pacing-watch uses this to
 * decide when to wake the agent.
 */
export async function getPerformance(windowHours = 24): Promise<ChannelMetrics[]> {
  const raw = (await call(config.metadata.tools.getPerformance, { window_hours: windowHours })) as unknown;
  const rows = extractRows(raw);
  return rows.map((r) => ({
    channel: String(r.channel ?? r.platform ?? "").toLowerCase() as Channel,
    spend: Number(r.spend ?? r.cost ?? 0),
    cpl: Number(r.cpl ?? r.cpa ?? 0),
    pipelinePerDollar: Number(r.pipeline_per_dollar ?? r.roas ?? 0),
  }));
}

// ── Writes (every one gated upstream by guardrails + Slack approval) ─────────

export async function pauseAdSet(channel: Channel, adSetId: string, reason: string) {
  return call(config.metadata.tools.pause, { channel, ad_set_id: adSetId, reason });
}

export async function updateBid(channel: Channel, campaignId: string, bid: number) {
  return call(config.metadata.tools.setBid, { channel, campaign_id: campaignId, bid });
}

export async function moveBudget(from: Channel, to: Channel, dailyUsd: number, reason: string) {
  return call(config.metadata.tools.moveBudget, {
    from_channel: from,
    to_channel: to,
    daily_usd: dailyUsd,
    reason,
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractRows(raw: unknown): Record<string, unknown>[] {
  // MCP tool results come back as content blocks; the data is usually JSON in a
  // text block. Be liberal about where the array lives.
  let data: unknown = raw;
  if (Array.isArray(raw)) {
    const textBlock = raw.find((b) => b && typeof b === "object" && (b as any).type === "text");
    if (textBlock) {
      try {
        data = JSON.parse((textBlock as any).text);
      } catch {
        data = raw;
      }
    }
  }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["channels", "rows", "data", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}
