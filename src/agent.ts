import Anthropic from "@anthropic-ai/sdk";
import { config, type Channel } from "./config.js";
import { systemPrompt } from "./prompts.js";
import { evaluate, enqueue, type ProposedChange } from "./guardrails.js";
import { pauseCampaign, rebidCampaign, moveBudget } from "./metadata.js";

/**
 * The agent loop. Claude runs on Opus 4.8 with adaptive thinking. It reads live
 * performance straight from MetadataONE through the MCP connector, and proposes
 * changes through three guarded write tools. Reads are the connector's job;
 * writes are ours, so the guardrails and the Slack approval gate are real.
 */

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
const MCP_BETA = "mcp-client-2025-11-20";

/** Called when a move needs a human. The Slack layer posts the approval card. */
export type ApprovalNotifier = (change: ProposedChange, id: string) => Promise<void>;

export interface RunOptions {
  history?: Anthropic.Beta.Messages.BetaMessageParam[];
  onApprovalNeeded?: ApprovalNotifier;
}

export interface RunResult {
  reply: string;
  messages: Anthropic.Beta.Messages.BetaMessageParam[];
}

// ── MetadataONE wiring ───────────────────────────────────────────────────────

function mcpServers(): Anthropic.Beta.Messages.BetaRequestMCPServerURLDefinition[] {
  return [
    {
      type: "url",
      name: "metadataone",
      url: config.metadata.mcpUrl,
      authorization_token: config.metadata.token,
    },
  ];
}

/**
 * Read tools on, write tools off. Claude can pull metrics through the connector
 * but cannot change spend with it. Every change has to come through our guarded
 * tools below.
 */
function metadataToolset(): any {
  const t = config.metadata.tools;
  return {
    type: "mcp_toolset",
    mcp_server_name: "metadataone",
    configs: {
      // Deny the spend-mutating tools to the connector so Claude cannot change
      // spend with it. Every change is routed through our guarded tools below.
      [t.manageCampaign]: { enabled: false },
      [t.updateBudgets]: { enabled: false },
      launch_campaign: { enabled: false },
    },
  };
}

// ── The three guarded write tools the agent proposes through ──────────────────

const writeTools: Anthropic.Beta.Messages.BetaToolUnion[] = [
  {
    name: "pause_ad_sets",
    description:
      "Pause one or more losing ad sets on a channel. Day-to-day work; executes immediately. Use when an ad set has crossed the CPL ceiling or fatigued.",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["linkedin", "meta", "google", "reddit", "x"] },
        ad_set_ids: { type: "array", items: { type: "string" } },
        reason: { type: "string", description: "One line, the number that justifies it." },
      },
      required: ["channel", "ad_set_ids", "reason"],
    },
  },
  {
    name: "rebid",
    description:
      "Raise or lower the bid on a campaign to win the auctions worth winning. Day-to-day work; executes immediately.",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["linkedin", "meta", "google", "reddit", "x"] },
        campaign_id: { type: "string" },
        new_bid: { type: "number" },
        reason: { type: "string" },
      },
      required: ["channel", "campaign_id", "new_bid", "reason"],
    },
  },
  {
    name: "move_budget",
    description:
      "Move daily budget from one channel to another, toward whatever is returning pipeline. Moves at or under the auto-approve limit execute immediately; larger moves are sent to Slack for human sign-off.",
    input_schema: {
      type: "object",
      properties: {
        from_channel: { type: "string", enum: ["linkedin", "meta", "google", "reddit", "x"] },
        to_channel: { type: "string", enum: ["linkedin", "meta", "google", "reddit", "x"] },
        daily_usd: { type: "number" },
        reason: { type: "string" },
      },
      required: ["from_channel", "to_channel", "daily_usd", "reason"],
    },
  },
];

// ── Tool execution, gated by guardrails ──────────────────────────────────────

async function runChange(change: ProposedChange, onApproval?: ApprovalNotifier): Promise<string> {
  const decision = evaluate(change);
  if (decision.verdict === "reject") {
    return `Blocked: ${decision.reason}`;
  }
  if (decision.verdict === "auto") {
    await change.execute();
    return `Done. ${change.summary}`;
  }
  // approval: queue it and let the Slack layer post the card. Non-blocking. The
  // move executes when the human clicks Approve, not inside this run.
  const id = enqueue(change);
  if (onApproval) await onApproval(change, id);
  return `Queued for approval and posted to ${config.slack.channel} for sign-off (${decision.reason}). It will execute when someone approves it in the thread.`;
}

async function execTool(name: string, input: any, onApproval?: ApprovalNotifier): Promise<string> {
  if (name === "pause_ad_sets") {
    const channel = input.channel as Channel;
    const ids = (input.ad_set_ids as string[]) ?? [];
    const reason = String(input.reason ?? "");
    return runChange(
      {
        kind: "pause",
        dailyUsd: 0,
        summary: `Paused ${ids.length} ${channel} ad set${ids.length === 1 ? "" : "s"}. ${reason}`,
        execute: async () => {
          for (const id of ids) await pauseCampaign(channel, id, reason);
        },
      },
      onApproval,
    );
  }

  if (name === "rebid") {
    const channel = input.channel as Channel;
    const campaignId = String(input.campaign_id);
    const bid = Number(input.new_bid);
    const reason = String(input.reason ?? "");
    return runChange(
      {
        kind: "rebid",
        dailyUsd: 0,
        summary: `Rebid ${channel} campaign ${campaignId} to ${bid}. ${reason}`,
        execute: async () => {
          await rebidCampaign(channel, campaignId, bid, reason);
        },
      },
      onApproval,
    );
  }

  if (name === "move_budget") {
    const from = input.from_channel as Channel;
    const to = input.to_channel as Channel;
    const daily = Number(input.daily_usd);
    const reason = String(input.reason ?? "");
    return runChange(
      {
        kind: "move_budget",
        dailyUsd: daily,
        summary: `Move $${Math.round(daily).toLocaleString("en-US")}/day from ${from} to ${to}. ${reason}`,
        execute: async () => {
          await moveBudget(from, to, daily, reason);
        },
      },
      onApproval,
    );
  }

  return `Unknown tool ${name}.`;
}

// ── The loop ─────────────────────────────────────────────────────────────────

export async function runAgent(userText: string, opts: RunOptions = {}): Promise<RunResult> {
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    ...(opts.history ?? []),
    { role: "user", content: userText },
  ];

  for (let step = 0; step < 8; step++) {
    const res = await anthropic.beta.messages.create({
      model: config.anthropic.model,
      max_tokens: 8000,
      // Adaptive thinking + effort are current-API; cast keeps it building on
      // SDK versions whose types still predate them.
      thinking: { type: "adaptive" } as any,
      output_config: { effort: config.anthropic.effort } as any,
      system: systemPrompt(),
      messages,
      mcp_servers: mcpServers(),
      tools: [metadataToolset(), ...writeTools],
      betas: [MCP_BETA],
    });

    // Server hit the MCP tool-loop limit; re-send to let it continue.
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    const toolUses = res.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
    );

    if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
      return { reply: textOf(res.content), messages };
    }

    messages.push({ role: "assistant", content: res.content });

    const results: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    for (const tu of toolUses) {
      const out = await execTool(tu.name, tu.input, opts.onApprovalNeeded);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: "I hit the step limit on this one. Narrow the ask and I will pick it back up.", messages };
}

function textOf(content: Anthropic.Beta.Messages.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
