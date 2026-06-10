import cron from "node-cron";
import { config } from "./config.js";
import { start } from "./slack.js";
import { runPacingWatch } from "./jobs/pacing-watch.js";
import { runWeeklyReadout } from "./jobs/weekly-readout.js";

/**
 * Boot the agent: bring it online in Slack, then schedule the intraday pacing
 * watch and the weekly readout. After this runs once you stop opening ad
 * managers.
 */
async function main() {
  await start();

  cron.schedule(
    config.schedule.pacingCron,
    () => {
      runPacingWatch().catch((e) => console.error("pacing-watch failed:", e));
    },
    { timezone: config.schedule.timezone },
  );

  cron.schedule(
    config.schedule.weeklyCron,
    () => {
      runWeeklyReadout().catch((e) => console.error("weekly-readout failed:", e));
    },
    { timezone: config.schedule.timezone },
  );

  console.log(
    `⏱  Pacing watch: "${config.schedule.pacingCron}" | Weekly readout: "${config.schedule.weeklyCron}" (${config.schedule.timezone})`,
  );
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
