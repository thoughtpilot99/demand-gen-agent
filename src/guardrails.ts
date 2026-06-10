import { randomUUID } from "node:crypto";
import { config } from "./config.js";

/**
 * Guardrails decide what the agent does on its own versus what waits for you.
 *
 * Day-to-day moves the post promises it handles without waiting (rebidding the
 * auctions worth winning, pausing the losers) are reversible and execute
 * automatically. Budget reallocations above the auto-approve limit are the
 * "big moves": they get queued and posted to Slack for a one-click sign-off.
 */

export type ChangeKind = "pause" | "rebid" | "move_budget";

export interface ProposedChange {
  kind: ChangeKind;
  /** Headline for the Slack card and the agent's reply (e.g. "Shift $4.2K/day · Meta → LinkedIn"). */
  summary: string;
  /** Optional rationale shown under the headline on the approval card. */
  detail?: string;
  /** Daily dollars at stake (budget moves). 0 for pause/rebid. */
  dailyUsd: number;
  /** Performs the actual MetadataONE write. Called on auto-approve or on click. */
  execute: () => Promise<void>;
}

export type Decision =
  | { verdict: "auto"; reason: string }
  | { verdict: "approval"; reason: string }
  | { verdict: "reject"; reason: string };

export function evaluate(change: ProposedChange): Decision {
  if (change.kind === "move_budget") {
    if (change.dailyUsd > config.guardrails.maxDailyShiftUsd) {
      return {
        verdict: "reject",
        reason: `$${fmt(change.dailyUsd)}/day is above the hard ceiling of $${fmt(
          config.guardrails.maxDailyShiftUsd,
        )}/day. Break it into smaller moves.`,
      };
    }
    if (change.dailyUsd > config.guardrails.autoApproveDailyUsd) {
      return {
        verdict: "approval",
        reason: `$${fmt(change.dailyUsd)}/day is above your $${fmt(
          config.guardrails.autoApproveDailyUsd,
        )}/day auto-approve limit.`,
      };
    }
  }
  return { verdict: "auto", reason: "Within day-to-day limits." };
}

// ── pending-approval store ───────────────────────────────────────────────────
// In-memory for the giveaway. For production, back this with Redis or a table so
// approvals survive a restart.

interface Pending extends ProposedChange {
  id: string;
  createdAt: number;
}

const pending = new Map<string, Pending>();

export function enqueue(change: ProposedChange): string {
  const id = randomUUID().slice(0, 8);
  pending.set(id, { ...change, id, createdAt: Date.now() });
  return id;
}

export function get(id: string): Pending | undefined {
  return pending.get(id);
}

/** Execute (approve) or discard (hold) a queued change. Returns the change. */
export async function resolve(id: string, action: "approve" | "hold"): Promise<Pending | null> {
  const change = pending.get(id);
  if (!change) return null;
  pending.delete(id);
  if (action === "approve") await change.execute();
  return change;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
