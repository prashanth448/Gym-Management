
const { randomUUID } = require("crypto");
const router = require("express").Router();
const auth = require("../middleware/auth");
const { getStore } = require("../data/store");
const Customer = require("../models/Customer");
const Gym = require("../models/Gym");
const { emitAdminDataChanged, emitGymDataChanged } = require("../realtime");
const { getTodayDate, parseDateOnly } = require("../utils/date");
const { getPlanEnd, isValidPlan } = require("../utils/plan");
const { isValidPhoneNumber, normalizePhoneNumber } = require("../utils/otp");
const {
  buildReminderMessage,
  buildReminderTemplatePayload,
  sendWhatsAppMessage,
  toWhatsAppRecipient
} = require("../utils/whatsappReminders");

const MANUAL_EXPIRED_REMINDER_DAILY_LIMIT = 2;
const EXPIRED_REMINDER_BATCH_SIZE = 10;
const EXPIRED_REMINDER_JOB_TTL_MS = 30 * 60 * 1000;
const expiredReminderJobs = new Map();

function requireOwner(req, res) {
  if (req.user.role !== "owner") {
    res.status(403).json({ message: "Owner access required." });
    return false;
  }

  return true;
}

function parseOptionalNumber(value) {
  return value === undefined || value === null || value === "" ? undefined : Number(value);
}

function normalizeOptionalEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validateCustomerPayload(payload, options = {}) {
  const { partial = false } = options;
  const requiredFields = ["fullName", "phone", "age", "plan", "amountPaid", "planStart"];

  if (
    !partial &&
    requiredFields.some((field) => payload[field] === undefined || payload[field] === "")
  ) {
    return "Please fill in name, phone, age, membership plan, and amount paid before saving.";
  }

  if (payload.fullName !== undefined && !String(payload.fullName).trim()) {
    return "Customer name is required.";
  }

  if (payload.phone !== undefined && !String(payload.phone).trim()) {
    return "Phone number is required.";
  }

  if (payload.phone !== undefined && !isValidPhoneNumber(payload.phone)) {
    return "Enter a valid mobile number with 10 to 15 digits.";
  }

  if (payload.email !== undefined && payload.email !== "" && !isValidEmail(payload.email)) {
    return "Enter a valid email address.";
  }

  if (payload.plan !== undefined && !isValidPlan(payload.plan)) {
    return "Choose a valid membership plan.";
  }

  if (payload.age !== undefined) {
    if (!Number.isInteger(payload.age) || payload.age < 1 || payload.age > 120) {
      return "Age must be a whole number between 1 and 120.";
    }
  }

  if (payload.amountPaid !== undefined) {
    if (!Number.isFinite(payload.amountPaid) || payload.amountPaid < 0) {
      return "Amount paid must be 0 or more.";
    }
  }

  if (payload.dueAmount !== undefined) {
    if (!Number.isFinite(payload.dueAmount) || payload.dueAmount < 0) {
      return "Due amount must be 0 or more.";
    }
  }

  if (payload.planStart !== undefined && payload.planStart !== "" && !parseDateOnly(payload.planStart)) {
    return "Plan start must be a valid date.";
  }

  if (payload.planEnd !== undefined && payload.planEnd !== "" && !parseDateOnly(payload.planEnd)) {
    return "Plan end must be a valid date.";
  }

  if (
    payload.lastAttended !== undefined &&
    payload.lastAttended !== "" &&
    !parseDateOnly(payload.lastAttended)
  ) {
    return "Last attended must be a valid date.";
  }

  if (
    payload.lastAttended !== undefined &&
    payload.lastAttended !== "" &&
    payload.lastAttended > getTodayDate()
  ) {
    return "Last attended cannot be a future date.";
  }

  if (payload.recordedOn !== undefined && payload.recordedOn !== "" && !parseDateOnly(payload.recordedOn)) {
    return "Payment date must be a valid date.";
  }

  const planStart = payload.planStart;
  const planEnd =
    payload.planEnd !== undefined
      ? payload.planEnd
      : payload.planStart && payload.plan
        ? getPlanEnd(payload.planStart, payload.plan)
        : undefined;

  if (planStart && planEnd && parseDateOnly(planEnd) < parseDateOnly(planStart)) {
    return "Plan end cannot be earlier than plan start.";
  }

  return "";
}

function validateRenewalPayload(payload) {
  const requiredFields = ["plan", "amountPaid", "planStart"];

  if (requiredFields.some((field) => payload[field] === undefined || payload[field] === "")) {
    return "Please fill in membership plan, amount paid, and plan start before renewing.";
  }

  if (payload.plan !== undefined && !isValidPlan(payload.plan)) {
    return "Choose a valid membership plan.";
  }

  if (payload.amountPaid !== undefined) {
    if (!Number.isFinite(payload.amountPaid) || payload.amountPaid < 0) {
      return "Amount paid must be 0 or more.";
    }
  }

  if (payload.dueAmount !== undefined) {
    if (!Number.isFinite(payload.dueAmount) || payload.dueAmount < 0) {
      return "Due amount must be 0 or more.";
    }
  }

  if (payload.planStart !== undefined && payload.planStart !== "" && !parseDateOnly(payload.planStart)) {
    return "Plan start must be a valid date.";
  }

  if (payload.planEnd !== undefined && payload.planEnd !== "" && !parseDateOnly(payload.planEnd)) {
    return "Plan end must be a valid date.";
  }

  if (payload.recordedOn !== undefined && payload.recordedOn !== "" && !parseDateOnly(payload.recordedOn)) {
    return "Payment date must be a valid date.";
  }

  const planEnd =
    payload.planEnd !== undefined
      ? payload.planEnd
      : payload.planStart && payload.plan
        ? getPlanEnd(payload.planStart, payload.plan)
        : undefined;

  if (payload.planStart && planEnd && parseDateOnly(planEnd) < parseDateOnly(payload.planStart)) {
    return "Plan end cannot be earlier than plan start.";
  }

  return "";
}

function getExpiredReminderCustomerProjection() {
  return {
    _id: 0,
    gymId: 1,
    customerId: 1,
    fullName: 1,
    phone: 1,
    planEnd: 1
  };
}

function getActiveExpiredReminderJob(gymId) {
  return Array.from(expiredReminderJobs.values()).find(
    (job) => job.gymId === gymId && ["queued", "running"].includes(job.status)
  );
}

function buildExpiredReminderJobResponse(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    eligibleCount: job.eligibleCount,
    processedCount: job.processedCount,
    sentCount: job.sentCount,
    failedCount: job.failedCount,
    message: job.message
  };
}

function scheduleExpiredReminderJobCleanup(jobId) {
  const cleanupTimer = setTimeout(() => {
    expiredReminderJobs.delete(jobId);
  }, EXPIRED_REMINDER_JOB_TTL_MS);

  cleanupTimer.unref?.();
}

async function processExpiredReminderJob(job) {
  job.status = "running";
  job.message = `Sending expired member reminders to ${job.eligibleCount} member${
    job.eligibleCount === 1 ? "" : "s"
  }.`;

  for (let index = 0; index < job.customers.length; index += EXPIRED_REMINDER_BATCH_SIZE) {
    const batch = job.customers.slice(index, index + EXPIRED_REMINDER_BATCH_SIZE);

    await Promise.all(
      batch.map(async (customer) => {
        try {
          const recipient = toWhatsAppRecipient(customer.phone, {
            defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE
          });
          const message = buildReminderMessage({
            customer,
            gymName: job.gymName,
            reminderType: "expired"
          });
          const templatePayload = buildReminderTemplatePayload({
            customer,
            gymName: job.gymName,
            reminderType: "expired"
          });

          if (!templatePayload) {
            throw new Error(
              "Configure META_WHATSAPP_EXPIRED_TEMPLATE_NAME before sending expired member reminders."
            );
          }

          await sendWhatsAppMessage({
            to: recipient,
            body: message,
            templatePayload
          });

          await Customer.updateOne(
            {
              gymId: job.gymId,
              customerId: customer.customerId
            },
            {
              $set: {
                lastReminderChannel: "whatsapp",
                lastReminderType: "expired-manual",
                lastReminderPlanEnd: customer.planEnd,
                lastReminderSentOn: job.today
              }
            }
          );

          job.sentCount += 1;
        } catch (error) {
          job.failedCount += 1;
          job.failures.push(`${customer.fullName}: ${error.message}`);
        } finally {
          job.processedCount += 1;
        }
      })
    );

    job.message = `Sending expired member reminders: ${job.processedCount} of ${job.eligibleCount} processed.`;
  }

  if (job.sentCount > 0) {
    emitGymDataChanged(job.gymId, "expired-reminders-sent");
  }

  job.status = "completed";
  job.customers = [];

  const messageParts = [];
  if (job.sentCount > 0) {
    messageParts.push(
      `${job.sentCount} expired member reminder${job.sentCount === 1 ? "" : "s"} sent.`
    );
  }

  if (job.failedCount > 0) {
    messageParts.push(`${job.failedCount} reminder${job.failedCount === 1 ? "" : "s"} failed.`);
  }

  job.message = messageParts.join(" ") || "No expired member reminders were sent.";
}

router.get("/", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const hasPaginationRequest =
    req.query.page !== undefined || req.query.pageSize !== undefined;

  if (hasPaginationRequest) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const query = String(req.query.query || "").trim();
    const status = String(req.query.status || "All").trim();
    const dueStatus = String(req.query.dueStatus || "All").trim();

    const [directory, summary] = await Promise.all([
      getStore().listCustomersPageByGymId(req.user.gymId, {
        page,
        pageSize,
        query,
        status,
        dueStatus
      }),
      getStore().getCustomerDirectorySummary(req.user.gymId)
    ]);

    return res.json({
      items: directory.items,
      pagination: directory.pagination,
      summary
    });
  }

  const data = await getStore().listCustomersByGymId(req.user.gymId);
  res.json(data);
});

router.get("/attendance", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const query = String(req.query.query || "").trim();

  const [directory, summary] = await Promise.all([
    getStore().listAttendancePageByGymId(req.user.gymId, {
      page,
      pageSize,
      query
    }),
    getStore().getAttendanceSummary(req.user.gymId)
  ]);

  res.json({
    items: directory.items,
    pagination: directory.pagination,
    summary
  });
});

router.get("/dashboard", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const snapshot = await getStore().getDashboardSnapshot(req.user.gymId);
  res.json(snapshot);
});

router.post("/reminders/expired", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const today = getTodayDate();
  const gymName = req.user.gymName || "your gym";

  try {
    const activeJob = getActiveExpiredReminderJob(req.user.gymId);

    if (activeJob) {
      return res.status(202).json(buildExpiredReminderJobResponse(activeJob));
    }

    const gym = await Gym.findOne(
      {
        gymId: req.user.gymId
      },
      {
        _id: 0,
        manualExpiredReminderSentOn: 1,
        manualExpiredReminderSendCount: 1
      }
    ).lean();
    const sendCountToday =
      gym?.manualExpiredReminderSentOn === today
        ? Number(gym.manualExpiredReminderSendCount || 0)
        : 0;

    if (sendCountToday >= MANUAL_EXPIRED_REMINDER_DAILY_LIMIT) {
      return res.status(429).json({
        message: `Expired member reminders can be sent only ${MANUAL_EXPIRED_REMINDER_DAILY_LIMIT} times per day. Please try again tomorrow.`
      });
    }

    const templatePayload = buildReminderTemplatePayload({
      customer: {
        fullName: "Member",
        planEnd: today
      },
      gymName,
      reminderType: "expired"
    });

    if (!templatePayload) {
      return res.status(400).json({
        message:
          "Configure META_WHATSAPP_EXPIRED_TEMPLATE_NAME before sending expired member reminders."
      });
    }

    const expiredCustomers = await Customer.find(
      {
        gymId: req.user.gymId,
        planEnd: { $lt: today },
        phone: { $ne: "" }
      },
      getExpiredReminderCustomerProjection()
    ).lean();

    if (!expiredCustomers.length) {
      return res.json({
        status: "completed",
        eligibleCount: 0,
        processedCount: 0,
        sentCount: 0,
        failedCount: 0,
        message: "No expired members found."
      });
    }

    await Gym.updateOne(
      {
        gymId: req.user.gymId
      },
      {
        $set: {
          manualExpiredReminderSentOn: today,
          manualExpiredReminderSendCount: sendCountToday + 1
        }
      }
    );

    const job = {
      jobId: randomUUID(),
      gymId: req.user.gymId,
      gymName,
      today,
      status: "queued",
      eligibleCount: expiredCustomers.length,
      processedCount: 0,
      sentCount: 0,
      failedCount: 0,
      failures: [],
      customers: expiredCustomers,
      message: `Queued expired member reminders for ${expiredCustomers.length} member${
        expiredCustomers.length === 1 ? "" : "s"
      }.`
    };

    expiredReminderJobs.set(job.jobId, job);
    scheduleExpiredReminderJobCleanup(job.jobId);
    setImmediate(() => {
      processExpiredReminderJob(job).catch((error) => {
        console.error("Unable to process expired member reminder job.", error);
        job.status = "failed";
        job.message = "Unable to send expired member reminders.";
        job.customers = [];
      });
    });

    res.status(202).json(buildExpiredReminderJobResponse(job));
  } catch (error) {
    console.error("Unable to send expired member reminders.", error);
    res.status(500).json({ message: "Unable to send expired member reminders." });
  }
});

router.get("/reminders/expired/:jobId", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const job = expiredReminderJobs.get(req.params.jobId);

  if (!job || job.gymId !== req.user.gymId) {
    return res.status(404).json({ message: "Reminder job not found." });
  }

  res.json(buildExpiredReminderJobResponse(job));
});

router.get("/:customerId", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const customer = await getStore().findCustomerByGymIdAndId(
    req.user.gymId,
    req.params.customerId
  );

  if (!customer) {
    return res.status(404).json({ message: "Not found" });
  }

  res.json(customer);
});

router.post("/", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const payload = {
    fullName: req.body.fullName?.trim(),
    phone: normalizePhoneNumber(req.body.phone),
    email: normalizeOptionalEmail(req.body.email),
    age: parseOptionalNumber(req.body.age),
    plan: req.body.plan,
    amountPaid: parseOptionalNumber(req.body.amountPaid),
    dueAmount: parseOptionalNumber(req.body.dueAmount) ?? 0,
    planStart: req.body.planStart?.trim(),
    planEnd: req.body.planEnd?.trim(),
    recordedOn: req.body.recordedOn?.trim(),
    photo: req.body.photo
  };

  const message = validateCustomerPayload(payload);

  if (message) {
    return res.status(400).json({ message });
  }

  if (await getStore().isCustomerPhoneTaken(payload.phone)) {
    return res.status(400).json({
      message: "That mobile number is already registered to another member."
    });
  }

  const customer = await getStore().createCustomer(req.user.gymId, payload);
  emitAdminDataChanged("customer-created", { gymId: req.user.gymId });
  emitGymDataChanged(req.user.gymId, "customer-created");
  res.status(201).json(customer);
});

router.put("/:customerId", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  try {
    const payload = {
      fullName: req.body.fullName?.trim(),
      phone: normalizePhoneNumber(req.body.phone),
      email: normalizeOptionalEmail(req.body.email),
      age: parseOptionalNumber(req.body.age),
      plan: req.body.plan,
      amountPaid: parseOptionalNumber(req.body.amountPaid),
      dueAmount: parseOptionalNumber(req.body.dueAmount) ?? 0,
      planStart: req.body.planStart?.trim(),
      planEnd: req.body.planEnd?.trim(),
      recordedOn: req.body.recordedOn?.trim(),
      lastAttended:
        req.body.lastAttended === "" ? "" : req.body.lastAttended?.trim(),
      photo: req.body.photo
    };

    const message = validateCustomerPayload(payload);

    if (message) {
      return res.status(400).json({ message });
    }

    if (
      await getStore().isCustomerPhoneTaken(
        payload.phone,
        req.user.gymId,
        Number(req.params.customerId)
      )
    ) {
      return res.status(400).json({
        message: "That mobile number is already registered to another member."
      });
    }

    const c = await getStore().updateCustomer(
      req.user.gymId,
      req.params.customerId,
      payload
    );

    if (!c) {
      return res.status(404).json({ message: "Customer not found." });
    }

    emitGymDataChanged(req.user.gymId, "customer-updated");
    res.json(c);
  } catch (error) {
    console.error("Unable to update customer.", error);
    res.status(500).json({ message: "Unable to update customer details." });
  }
});

router.delete("/:customerId", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  try {
    const customer = await getStore().deleteCustomer(
      req.user.gymId,
      req.params.customerId
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    emitAdminDataChanged("customer-deleted", { gymId: req.user.gymId });
    emitGymDataChanged(req.user.gymId, "customer-deleted");
    res.json({
      message: `${customer.fullName} was deleted successfully.`,
      customer
    });
  } catch (error) {
    console.error("Unable to delete customer.", error);
    res.status(500).json({ message: "Unable to delete this customer." });
  }
});

router.post("/:customerId/renew", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  try {
    const payload = {
      plan: req.body.plan,
      amountPaid: parseOptionalNumber(req.body.amountPaid),
      dueAmount: parseOptionalNumber(req.body.dueAmount) ?? 0,
      planStart: req.body.planStart?.trim(),
      planEnd: req.body.planEnd?.trim(),
      recordedOn: req.body.recordedOn?.trim()
    };

    const message = validateRenewalPayload(payload);

    if (message) {
      return res.status(400).json({ message });
    }

    const customer = await getStore().renewCustomer(
      req.user.gymId,
      req.params.customerId,
      payload
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    emitGymDataChanged(req.user.gymId, "customer-renewed");
    res.json(customer);
  } catch (error) {
    console.error("Unable to renew customer membership.", error);
    res.status(500).json({ message: "Unable to renew this membership." });
  }
});

router.post("/attendance", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const customerId = Number(req.body.customerId);

  if (!Number.isInteger(customerId) || customerId < 1) {
    return res.status(400).json({ message: "A valid customer ID is required." });
  }

  const result = await getStore().recordAttendance(req.user.gymId, customerId, {
    source: "manual"
  });

  if (!result) return res.status(404).json({ message: "Not found" });

  if (result.attendanceRecorded) {
    emitGymDataChanged(req.user.gymId, "attendance-recorded");
  }
  res.json({
    ...result.customer,
    attendanceRecorded: result.attendanceRecorded
  });
});

module.exports = router;
