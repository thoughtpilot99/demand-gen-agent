import bolt from "@slack/bolt";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { runAgent } from "./agent.js";
import { resolve, type ProposedChange } from "./guardrails.js";

const { App } = bolt;

/**
 * Slack is where you run paid. You message the agent like a teammate, it replies
 * in the thread, and the big moves land here as Approve / Hold cards you sign off
 * on. Alerts and the weekly readout post here too.
 */
export const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
});

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

// ── Approval card + buttons ──────────────────────────────────────────────────

export async function postApproval(
  change: ProposedChange,
  id: string,
  channel: string = config.slack.channel,
  threadTs?: string,
) {
  await app.client.chat.postMessage({
    channel,
    ...(threadTs ? { thread_ts: threadTs } : {}),
    text: `One move needs your sign-off: ${change.summary}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*One move needs your sign-off*\n${change.summary}` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve & shift", emoji: true },
            style: "primary",
            action_id: "approve_change",
            value: id,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Hold", emoji: true },
            action_id: "hold_change",
            value: id,
          },
        ],
      },
    ],
  });
}

app.action("approve_change", async ({ ack, body, respond }) => {
  await ack();
  const id = (body as any).actions[0].value as string;
  const who = (body as any).user?.id ? `<@${(body as any).user.id}>` : "someone";
  try {
    const change = await resolve(id, "approve");
    await respond({
      replace_original: true,
      text: change
        ? `:white_check_mark: Approved by ${who}. ${change.summary} Done.`
        : "That move already expired or was handled.",
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
    text: change ? `:no_entry_sign: Held. Nothing moved. (${change.summary})` : "That move already expired.",
  });
});

// ── Outbound helpers used by the scheduled jobs ──────────────────────────────

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
