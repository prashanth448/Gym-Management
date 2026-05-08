const { diffInDays, parseDateOnly } = require("./date");
const { normalizePhoneNumber } = require("./otp");

const EXPIRY_REMINDER_OFFSETS = [3, 2, 1];
const EXPIRED_REMINDER_OFFSET = -1;
const DUE_AMOUNT_REMINDER_INTERVAL_DAYS = 3;

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function toWhatsAppAddress(value, options = {}) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    throw new Error("A WhatsApp phone number is required.");
  }

  if (rawValue.startsWith("whatsapp:")) {
    return rawValue;
  }

  if (rawValue.startsWith("+")) {
    return `whatsapp:${rawValue}`;
  }

  const digits = normalizePhoneNumber(rawValue);

  if (!digits) {
    throw new Error("A valid WhatsApp phone number is required.");
  }

  const defaultCountryCode = normalizePhoneNumber(options.defaultCountryCode);
  const e164Digits =
    digits.length === 10 && defaultCountryCode ? `${defaultCountryCode}${digits}` : digits;

  if (e164Digits.length < 11 || e164Digits.length > 15) {
    throw new Error(
      "WhatsApp phone numbers must be in E.164 format. Set WHATSAPP_DEFAULT_COUNTRY_CODE if you store 10-digit local numbers."
    );
  }

  return `whatsapp:+${e164Digits}`;
}

function getConfiguredWhatsAppSender() {
  const configuredSender =
    process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_NUMBER || "";

  if (!configuredSender.trim()) {
    return "";
  }

  return toWhatsAppAddress(configuredSender, {
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE
  });
}

function formatDisplayDate(value) {
  const parsed = parseDateOnly(value);

  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(parsed);
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function buildReminderMessage({ customer, gymName, reminderType }) {
  const firstName = String(customer.fullName || "Member").trim().split(/\s+/)[0] || "Member";
  const locationName = String(gymName || "your gym").trim();

  if (reminderType === "due-amount") {
    return [
      `Hi ${firstName}, you have a pending due amount of ${formatCurrency(customer.dueAmount)} in ${locationName}.`,
      "Please clear the due amount.",
      "Reply to this message or contact the gym front desk if you need help."
    ].join(" ");
  }

  const formattedPlanEnd = formatDisplayDate(customer.planEnd);
  const intro =
    reminderType === "expired"
      ? `your membership in ${locationName} has expired on ${formattedPlanEnd}.`
      : `your membership in ${locationName} is expiring soon on ${formattedPlanEnd}.`;

  return [
    `Hi ${firstName}, ${intro}`,
    "Please renew your membership to continue your workouts without interruption.",
    "Reply to this message or contact the gym front desk if you need help."
  ].join(" ");
}

function getReminderHistory(customer) {
  return Array.isArray(customer?.reminderHistory) ? customer.reminderHistory.filter(Boolean) : [];
}

function buildReminderKey({ reminderType, daysUntilExpiry, planEnd }) {
  return `whatsapp:${reminderType}:${daysUntilExpiry}:${planEnd}`;
}

function getDueReminderEvent(customer, today) {
  const daysUntilExpiry = diffInDays(today, customer?.planEnd);

  if (daysUntilExpiry === null) {
    return null;
  }

  if (EXPIRY_REMINDER_OFFSETS.includes(daysUntilExpiry)) {
    return {
      reminderType: "expiring",
      daysUntilExpiry,
      key: buildReminderKey({
        reminderType: "expiring",
        daysUntilExpiry,
        planEnd: customer.planEnd
      }),
      label: `${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} before expiry`
    };
  }

  if (daysUntilExpiry === EXPIRED_REMINDER_OFFSET) {
    return {
      reminderType: "expired",
      daysUntilExpiry,
      key: buildReminderKey({
        reminderType: "expired",
        daysUntilExpiry,
        planEnd: customer.planEnd
      }),
      label: "Expired reminder"
    };
  }

  return null;
}

function hasReminderBeenSent(customer, reminderEvent) {
  if (!reminderEvent?.key) {
    return false;
  }

  return getReminderHistory(customer).includes(reminderEvent.key);
}

function getDueAmountReminderEvent(customer, today) {
  const dueAmount = Number(customer?.dueAmount || 0);

  if (dueAmount <= 0) {
    return null;
  }

  const anchorDate = customer?.lastDueAmountReminderSentOn || customer?.dueAmountUpdatedOn || "";

  if (!anchorDate) {
    return {
      reminderType: "due-amount",
      label: "Due amount reminder",
      intervalDays: DUE_AMOUNT_REMINDER_INTERVAL_DAYS
    };
  }

  const daysSinceAnchor = diffInDays(anchorDate, today);

  if (daysSinceAnchor === null || daysSinceAnchor < DUE_AMOUNT_REMINDER_INTERVAL_DAYS) {
    return null;
  }

  return {
    reminderType: "due-amount",
    label: "Due amount reminder",
    intervalDays: DUE_AMOUNT_REMINDER_INTERVAL_DAYS,
    daysSinceAnchor
  };
}

async function sendWhatsAppMessage({ to, body }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = getConfiguredWhatsAppSender();

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM before sending WhatsApp reminders."
    );
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: to,
        From: from,
        Body: body
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`WhatsApp reminder delivery failed: ${details}`);
  }

  return response.json();
}

async function sendMembershipReminder({ customer, gymName, reminderType }) {
  const recipient = toWhatsAppAddress(customer.phone, {
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE
  });
  const body = buildReminderMessage({ customer, gymName, reminderType });
  const response = await sendWhatsAppMessage({ to: recipient, body });

  return {
    sid: response.sid,
    reminderType
  };
}

module.exports = {
  DUE_AMOUNT_REMINDER_INTERVAL_DAYS,
  EXPIRED_REMINDER_OFFSET,
  EXPIRY_REMINDER_OFFSETS,
  buildReminderMessage,
  buildReminderKey,
  formatDisplayDate,
  formatCurrency,
  getDueReminderEvent,
  getDueAmountReminderEvent,
  getReminderHistory,
  getConfiguredWhatsAppSender,
  hasReminderBeenSent,
  sendMembershipReminder,
  toWhatsAppAddress
};
