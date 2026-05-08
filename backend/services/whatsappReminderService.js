const Gym = require("../models/Gym");
const Customer = require("../models/Customer");
const { getTodayDate } = require("../utils/date");
const { emitGymDataChanged } = require("../realtime");
const {
  getDueReminderEvent,
  getDueAmountReminderEvent,
  hasReminderBeenSent,
  sendMembershipReminder
} = require("../utils/whatsappReminders");

async function dispatchDueWhatsAppReminders(options = {}) {
  const today = options.today || getTodayDate();
  const includeMembershipReminders = options.includeMembershipReminders !== false;
  const includeDueAmountReminders = options.includeDueAmountReminders === true;
  const gymFilter = {
    role: "owner",
    status: "Active"
  };

  if (options.gymId) {
    gymFilter.gymId = options.gymId;
  }

  const gyms = await Gym.find(gymFilter, {
    _id: 0,
    gymId: 1,
    gymName: 1
  }).lean();

  if (!gyms.length) {
    return {
      today,
      eligibleCount: 0,
      dueTodayCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      failures: [],
      message: "No active gyms found for automatic WhatsApp reminders."
    };
  }

  const gymMap = new Map(gyms.map((gym) => [gym.gymId, gym]));
  const customers = await Customer.find(
    {
      gymId: { $in: gyms.map((gym) => gym.gymId) }
    },
    {
      _id: 0,
      gymId: 1,
      customerId: 1,
      fullName: 1,
      phone: 1,
      planEnd: 1,
      dueAmount: 1,
      dueAmountUpdatedOn: 1,
      lastDueAmountReminderSentOn: 1,
      reminderHistory: 1,
      lastReminderChannel: 1,
      lastReminderType: 1,
      lastReminderPlanEnd: 1,
      lastReminderSentOn: 1
    }
  ).lean();

  let eligibleCount = 0;
  let dueTodayCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failures = [];
  const touchedGymIds = new Set();

  for (const customer of customers) {
    const reminderEvents = [];

    if (includeMembershipReminders) {
      const membershipReminderEvent = getDueReminderEvent(customer, today);

      if (membershipReminderEvent) {
        reminderEvents.push(membershipReminderEvent);
      }
    }

    if (includeDueAmountReminders) {
      const dueAmountReminderEvent = getDueAmountReminderEvent(customer, today);

      if (dueAmountReminderEvent) {
        reminderEvents.push(dueAmountReminderEvent);
      }
    }

    if (!reminderEvents.length) {
      continue;
    }

    for (const reminderEvent of reminderEvents) {
      eligibleCount += 1;
      dueTodayCount += 1;

      if (
        reminderEvent.reminderType !== "due-amount" &&
        hasReminderBeenSent(customer, reminderEvent)
      ) {
        skippedCount += 1;
        continue;
      }

      if (
        reminderEvent.reminderType === "due-amount" &&
        customer.lastDueAmountReminderSentOn === today
      ) {
        skippedCount += 1;
        continue;
      }

      try {
        await sendMembershipReminder({
          customer,
          gymName: gymMap.get(customer.gymId)?.gymName,
          reminderType: reminderEvent.reminderType
        });

        await Customer.updateOne(
          {
            gymId: customer.gymId,
            customerId: customer.customerId
          },
          reminderEvent.reminderType === "due-amount"
            ? {
                $set: {
                  lastDueAmountReminderSentOn: today
                }
              }
            : {
                $addToSet: {
                  reminderHistory: reminderEvent.key
                },
                $set: {
                  lastReminderChannel: "whatsapp",
                  lastReminderType: reminderEvent.reminderType,
                  lastReminderPlanEnd: customer.planEnd,
                  lastReminderSentOn: today
                }
              }
        );

        sentCount += 1;
        touchedGymIds.add(customer.gymId);
        if (reminderEvent.reminderType === "due-amount") {
          customer.lastDueAmountReminderSentOn = today;
        } else {
          customer.reminderHistory = [...(customer.reminderHistory || []), reminderEvent.key];
        }
      } catch (error) {
        failedCount += 1;
        failures.push(`${customer.fullName}: ${error.message}`);
      }
    }
  }

  for (const gymId of touchedGymIds) {
    emitGymDataChanged(gymId, "whatsappRemindersSent");
  }

  const messageParts = [];

  if (sentCount > 0) {
    messageParts.push(
      `${sentCount} WhatsApp reminder${sentCount === 1 ? "" : "s"} sent successfully.`
    );
  }

  if (!sentCount && !dueTodayCount) {
    messageParts.push("No WhatsApp reminders are due today.");
  }

  if (skippedCount > 0) {
    messageParts.push(
      `${skippedCount} reminder${skippedCount === 1 ? " was" : "s were"} already sent today.`
    );
  }

  if (failedCount > 0) {
    messageParts.push(
      `${failedCount} reminder${failedCount === 1 ? "" : "s"} failed.`
    );
  }

  return {
    today,
    eligibleCount,
    dueTodayCount,
    sentCount,
    failedCount,
    skippedCount,
    failures,
    message: messageParts.join(" ")
  };
}

module.exports = {
  dispatchDueWhatsAppReminders
};
