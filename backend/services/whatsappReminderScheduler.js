const { dispatchDueWhatsAppReminders } = require("./whatsappReminderService");

let schedulerTimeout = null;

function isSchedulerEnabled() {
  return String(process.env.AUTO_WHATSAPP_REMINDERS_ENABLED || "").trim().toLowerCase() === "true";
}

function parseScheduleTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());

  if (!match) {
    return { hour: 9, minute: 0 };
  }

  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return { hour, minute };
}

function getNextRunDate(now = new Date()) {
  const { hour, minute } = parseScheduleTime(process.env.AUTO_WHATSAPP_REMINDER_TIME || "09:00");
  const next = new Date(now);

  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

async function runScheduledDispatch() {
  try {
    const summary = await dispatchDueWhatsAppReminders({
      source: "scheduler",
      includeMembershipReminders: true,
      includeDueAmountReminders: true
    });
    console.log(
      `[WhatsApp Scheduler] ${summary.message} due=${summary.dueTodayCount} sent=${summary.sentCount} failed=${summary.failedCount}`
    );
  } catch (error) {
    console.error(`[WhatsApp Scheduler] Dispatch failed: ${error.message}`);
  }
}

function scheduleNextRun() {
  const nextRun = getNextRunDate();
  const delay = Math.max(1000, nextRun.getTime() - Date.now());

  schedulerTimeout = setTimeout(async () => {
    await runScheduledDispatch();
    scheduleNextRun();
  }, delay);

  console.log(
    `[WhatsApp Scheduler] Next automatic reminder run scheduled for ${nextRun.toLocaleString()}.`
  );
}

function startWhatsAppReminderScheduler() {
  if (!isSchedulerEnabled()) {
    console.log("[WhatsApp Scheduler] Automatic reminders are disabled.");
    return;
  }

  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
  }

  if (
    String(process.env.AUTO_WHATSAPP_REMINDERS_RUN_ON_STARTUP || "")
      .trim()
      .toLowerCase() === "true"
  ) {
    void runScheduledDispatch();
  }

  scheduleNextRun();
}

module.exports = {
  startWhatsAppReminderScheduler
};
