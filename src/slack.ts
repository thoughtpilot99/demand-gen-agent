import bolt from "@slack/bolt";
import type Anthropic from "@anthropic-ai/sdk";
import { config, CHANNEL_LABEL, type Channel } from "./config.js";
import { runAgent } from "./agent.js";
import { resolve, type ProposedChange } from "./guardrails.js";

const { App } = bolt;

/**
 * Slack is where you run paid. You message the agent like a teammate, it replies
 * in the thread, and the big moves land here as Approve / Hold cards you sign off
 * on. Alerts and the weekly readout post here too.
 *
 * The cards use the legacy `attachments` color bar (the only way to get the
 * left border) plus Block Kit blocks for the content and the buttons.
 */
export const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
});

// Brand colors for the card bars.
const CLAY = "#ea580c";
const RED = "#e01e5a";
const GREEN = "#2eb67d";
const SLATE = "#94a3b8";

// Lightweight per-thread memory so a back-and-forth keeps context.
const threadMemory = new Map<string, Anthropic.Beta.Messages.BetaMessageParam[]>();

async function handle(text: string, channel: string, threadTs: string, say: bolt.SayFn) {
  if (!text.trim()) return;
  const history = threadMemory.get(threadTs) ?? [];

  const onApprovalNeeded = async (change: ProposedChange, id: string) => {
    await postApproval(change, id, channel, threadTs);
  };

  try {
    const { reply, messages } = await runAgent(text, { history, onApprovalNeeded });
    threadMemory.set(threadTs, messages);
    await say({ text: reply, thread_ts: threadTs });
  } catch (err) {
    console.error("agent run failed:", err);
    await say({ text: "I hit an error running that. Check the logs and try again.", thread_ts: threadTs });
  }
}

// Mentioned in a channel (e.g. #paid-media).
app.event("app_mention", async ({ event, say }) => {
  const e = event as any;
  const text = String(e.text ?? "").replace(/<@[^>]+>/g, "").trim();
  await handle(text, e.channel, e.thread_ts ?? e.ts, say);
});

// Direct message to the agent.
app.message(async ({ message, say }) => {
  const m = message as any;
  if (m.subtype || m.bot_id) return; // ignore edits and other bots
  if (m.channel_type !== "im") return; // channels go through app_mention
  await handle(String(m.text ?? ""), m.channel, m.thread_ts ?? m.ts, say);
});

function dashFooter(): string {
  return config.dashboardUrl ? `   :bar_chart: Full picture: ${config.dashboardUrl}` : "";
}

function approveButtons(id: string) {
  return {
    type: "actions",
    elements: [
      { type: "button", text: { type: "plain_text", text: "Approve & shift", emoji: true }, style: "primary", action_id: "approve_change", value: id },
      { type: "button", text: { type: "plain_text", text: "Hold", emoji: true }, action_id: "hold_change", value: id },
    ],
  };
}

// ── Approval card ────────────────────────────────────────────────────────────

export async function postApproval(
  change: ProposedChange,
  id: string,
  channel: string = config.slack.channel,
  threadTs?: string,
) {
  const auto = config.guardrails.autoApproveDailyUsd.toLocaleString("en-US");
  await app.client.chat.postMessage({
    channel,
    ...(threadTs ? { thread_ts: threadTs } : {}),
    text: `One move needs your sign-off: ${change.summary}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "One bigger move needs your sign-off before I make it:" } },
    ],
    attachments: [
      {
        color: CLAY,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*${change.summary}*${change.detail ? `\n${change.detail}` : ""}` } },
          { type: "context", elements: [{ type: "mrkdwn", text: `:lock: *Needs approval*   Above your $${auto}/day auto-approve limit` }] },
          approveButtons(id),
        ],
      },
    ] as any,
  });
}

app.action("approve_change", async ({ ack, body, respond }) => {
  await ack();
  const id = (body as any).actions[0].value as string;
  const who = (body as any).user?.id ? `<@${(body as any).user.id}>` : "someone";
  try {
    const change = await resolve(id, "approve");
    if (!change) {
      await respond({ replace_original: true, text: "That move already expired or was handled." });
      return;
    }
    await respond({
      replace_original: true,
      text: `Approved. ${change.summary}. Done.`,
      attachments: [
        { color: GREEN, blocks: [{ type: "section", text: { type: "mrkdwn", text: `:white_check_mark: *Approved by ${who}.* ${change.summary}. Done.${dashFooter()}` } }] },
      ] as any,
    });
  } catch (err) {
    console.error("approve failed:", err);
    await respond({ replace_original: false, text: ":warning: The move was approved but the write failed. Check the logs." });
  }
});

app.action("hold_change", async ({ ack, body, respond }) => {
  await ack();
  const id = (body as any).actions[0].value as string;
  const change = await resolve(id, "hold");
  await respond({
    replace_original: true,
    text: change ? `Held. Nothing moved.` : "That move already expired.",
    attachments: change
      ? ([{ color: SLATE, blocks: [{ type: "section", text: { type: "mrkdwn", text: `:no_entry_sign: *Held.* Nothing moved. (${change.summary})` } }] }] as any)
      : undefined,
  });
});

// ── Alert card (intraday pacing watch) ───────────────────────────────────────

export async function postAlert(opts: { breaches: { channel: Channel; cpl: number }[]; ceiling: number; reply: string }) {
  const fields = opts.breaches.map((b) => ({
    type: "mrkdwn",
    text: `*${CHANNEL_LABEL[b.channel]} CPL*\n$${Math.round(b.cpl).toLocaleString("en-US")} ▲`,
  }));
  fields.push({ type: "mrkdwn", text: `*Your ceiling*\n$${opts.ceiling.toLocaleString("en-US")}` });

  const first = opts.breaches[0];
  const title =
    opts.breaches.length === 1 && first
      ? `${CHANNEL_LABEL[first.channel]} CPL crossed your ceiling`
      : `${opts.breaches.length} channels crossed your CPL ceiling`;

  await app.client.chat.postMessage({
    channel: config.slack.channel,
    text: "Heads up, a channel crossed your CPL ceiling.",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "Heads up. I caught this as it happened, not at month-end. :point_down:" } },
    ],
    attachments: [
      {
        color: RED,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `:red_circle: *${title}*\n${opts.reply}` } },
          { type: "section", fields },
        ],
      },
    ] as any,
  });
}

// ── Plain channel post (weekly readout) ──────────────────────────────────────

export async function postToChannel(text: string, blocks?: unknown[]) {
  await app.client.chat.postMessage({
    channel: config.slack.channel,
    text,
    ...(blocks ? { blocks: blocks as any } : {}),
  });
}

export async function start() {
  await app.start();
  console.log(`⚡ Demand gen agent is live in Slack (${config.slack.channel}).`);
}
