import { runAgent } from "../agent.js";
import { postToChannel } from "../slack.js";

/**
 * The weekly readout. Posts spend, CPL, and pipeline by channel into Slack, plus
 * the biggest moves the agent made that week. Read-only: it summarizes, it does
 * not touch spend.
 */
export async function runWeeklyReadout(): Promise<void> {
  const directive = `Write this week's paid readout for the team. Pull the live numbers and give spend, CPL, and pipeline by channel across LinkedIn, Meta, Google, Reddit and X, plus the blended CPL. Call out the biggest moves you made this week and the number behind each. Keep it tight and skimmable. Do not change anything right now, this is a summary.`;

  const { reply } = await runAgent(directive);
  await postToChannel(`:bar_chart: *Weekly paid readout*\n${reply}`);
}
