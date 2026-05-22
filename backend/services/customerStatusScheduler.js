const { getStore } = require("../data/store");
const { emitGymDataChanged } = require("../realtime");

let schedulerTimeout = null;

function isSchedulerEnabled() {
  return String(process.env.CUSTOMER_STATUS_SYNC_ENABLED || "true").trim().toLowerCase() !== "false";
}

function parseScheduleTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());

  if (!match) {
    return { hour: 0, minute: 10 };
  }

  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

function getNextRunDate(now = new Date()) {
  const { hour, minute } = parseScheduleTime(process.env.CUSTOMER_STATUS_SYNC_TIME || "00:10");
  const next = new Date(now);

  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

async function runCustomerStatusSync() {
  try {
    const summary = await getStore().syncCustomerMembershipStatuses();

    for (const gymId of summary.touchedGymIds) {
      emitGymDataChanged(gymId, "customer-status-sync");
    }

    console.log(
      `[Customer Status Scheduler] Synced statuses for ${summary.today}: active=${summary.updated.Active} expiring=${summary.updated.Expiring} expired=${summary.updated.Expired}`
    );
  } catch (error) {
    console.error(`[Customer Status Scheduler] Sync failed: ${error.message}`);
  }
}

function scheduleNextRun() {
  const nextRun = getNextRunDate();
  const delay = Math.max(1000, nextRun.getTime() - Date.now());

  schedulerTimeout = setTimeout(async () => {
    await runCustomerStatusSync();
    scheduleNextRun();
  }, delay);

  console.log(
    `[Customer Status Scheduler] Next customer status sync scheduled for ${nextRun.toLocaleString()}.`
  );
}

function startCustomerStatusScheduler() {
  if (!isSchedulerEnabled()) {
    console.log("[Customer Status Scheduler] Customer status sync is disabled.");
    return;
  }

  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
  }

  if (
    String(process.env.CUSTOMER_STATUS_SYNC_RUN_ON_STARTUP || "true")
      .trim()
      .toLowerCase() !== "false"
  ) {
    void runCustomerStatusSync();
  }

  scheduleNextRun();
}

module.exports = {
  startCustomerStatusScheduler
};
