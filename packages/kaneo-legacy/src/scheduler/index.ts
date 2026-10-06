import { Cron } from "croner";
import { checkBoardWebhookReminders } from "./board-webhook-reminders";
import { checkDueDateReminders } from "./due-date-reminders";
import { purgeExpiredTrashedTasks } from "./purge-trashed-tasks";
import { syncStaleRepos } from "./sync-stale-repos";

const jobs: Cron[] = [];

export function initializeScheduler(): void {
  jobs.push(new Cron("*/5 * * * *", checkDueDateReminders));
  jobs.push(new Cron("*/5 * * * *", checkBoardWebhookReminders));
  jobs.push(new Cron("*/15 * * * *", syncStaleRepos));
  jobs.push(new Cron("0 * * * *", purgeExpiredTrashedTasks));
  console.log(
    "⏰ Scheduler started (due date + board webhook reminders every 5m, stale repo resync every 15m, trash purge hourly)",
  );
}

export function shutdownScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
}
