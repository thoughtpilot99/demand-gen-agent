import { config } from "../config.js";
import { getPerformance } from "../metadata.js";
import { runAgent } from "../agent.js";
import { postAlert, postApproval } from "../slack.js";

/**
 * The intraday watch. This is the part of the post that matters most: most teams
 * find out a campaign went sideways days after the money is gone. This runs on a
 * schedule, pulls the last 24h, and only wakes the agent when a channel crosses
 * the CPL ceiling. When it does, the agent investigates, acts inside the
 * guardrails, and the result is posted to Slack so you see it as it happens.
 */
export async function runPacingWatch(): Promise<void> {
  const metrics = await getPerformance(24);
  const breaches = metrics.filter((m) => m.cpl > config.guardrails.cplCeilingUsd);

  if (breaches.length === 0) {
    console.log("pacing-watch: every channel inside the CPL ceiling. Nothing to flag.");
    return;
  }

  const summary = breaches
    .map((b) => `${b.channel} CPL $${Math.round(b.cpl).toLocaleString("en-US")}`)
    .join(", ");

  const directive = `Intraday pacing check. These channels just crossed the $${config.guardrails.cplCeilingUsd} CPL ceiling: ${summary}. Pull the live numbers, pause the weak ad sets, rebid where it helps, and move budget toward the best pipeline-per-dollar channel if it is worth it. Hold the blended CPL flat. Then give me a short readout of what you did.`;

  const { reply } = await runAgent(directive, {
    onApprovalNeeded: async (change, id) => {
      await postApproval(change, id);
    },
  });

  await postAlert({
    breaches: breaches.map((b) => ({ channel: b.channel, cpl: b.cpl })),
    ceiling: config.guardrails.cplCeilingUsd,
    reply,
  });
}
