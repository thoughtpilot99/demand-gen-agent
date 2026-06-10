Run the intraday pacing check.

1. Read performance across all five channels (use performance_metrics / account_level_stats).
2. If every channel is within the CPL ceiling, do nothing and stay quiet. Stop here, post nothing.
3. If a channel crossed the ceiling: validate it with the read tools, then handle it inside your guardrails. Pause the weak ad sets, rebid where it helps, and move budget toward the best pipeline-per-dollar channel if it is worth it and within your auto-approve limit. Anything over the limit, post to Slack for sign-off instead of doing it.
4. Post one intraday alert to Slack in the "Intraday alert" shape, summarizing what you caught and what you did.
