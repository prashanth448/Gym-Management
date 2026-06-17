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

function toWhatsAppRecipient(value, options = {}) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    throw new Error("A WhatsApp phone number is required.");
  }

  const digits = normalizePhoneNumber(rawValue.replace(/^whatsapp:/i, ""));

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

  return e164Digits;
}

function getConfiguredWhatsAppSender() {
  return process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
}

function getMetaWhatsAppApiVersion() {
  const configuredVersion = process.env.META_WHATSAPP_API_VERSION?.trim() || "v20.0";

  return configuredVersion.startsWith("v") ? configuredVersion : `v${configuredVersion}`;
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

function getReminderDisplayValues({ customer, gymName }) {
  return {
    firstName: String(customer.fullName || "Member").trim().split(/\s+/)[0] || "Member",
    locationName: String(gymName || "your gym").trim(),
    formattedPlanEnd: formatDisplayDate(customer.planEnd),
    formattedDueAmount: formatCurrency(customer.dueAmount)
  };
}

function buildReminderMessage({ customer, gymName, reminderType }) {
  const { firstName, locationName, formattedPlanEnd, formattedDueAmount } =
    getReminderDisplayValues({ customer, gymName });

  if (reminderType === "due-amount") {
    return [
      `Hi ${firstName}, you have a pending due amount of ${formattedDueAmount} in ${locationName}.`,
      "Please clear the due amount.",
      "Reply to this message or contact the gym front desk if you need help."
    ].join(" ");
  }

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

function getReminderTemplateName(reminderType) {
  const templateEnvByType = {
    "due-amount": "META_WHATSAPP_DUE_AMOUNT_TEMPLATE_NAME",
    expired: "META_WHATSAPP_EXPIRED_TEMPLATE_NAME",
    expiring: "META_WHATSAPP_EXPIRING_TEMPLATE_NAME"
  };
  const specificTemplate = process.env[templateEnvByType[reminderType]]?.trim();

  return specificTemplate || process.env.META_WHATSAPP_TEMPLATE_NAME?.trim() || "";
}

function buildTemplateParameter(value) {
  return {
    type: "text",
    text: String(value || "")
  };
}

function buildReminderTemplatePayload({ customer, gymName, reminderType }) {
  const templateName = getReminderTemplateName(reminderType);

  if (!templateName) {
    return null;
  }

  const { firstName, locationName, formattedPlanEnd, formattedDueAmount } =
    getReminderDisplayValues({ customer, gymName });
  const languageCode = process.env.META_WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en_US";
  const parameters =
    reminderType === "due-amount"
      ? [firstName, formattedDueAmount, locationName]
      : [firstName, locationName, formattedPlanEnd];

  return {
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode
      },
      components: [
        {
          type: "body",
          parameters: parameters.map(buildTemplateParameter)
        }
      ]
    }
  };
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

async function sendWhatsAppMessage({ to, body, templatePayload }) {
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = getConfiguredWhatsAppSender();

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      "Configure META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID before sending WhatsApp reminders."
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/${getMetaWhatsAppApiVersion()}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        ...(templatePayload || {
          type: "text",
          text: {
            preview_url: false,
            body
          }
        })
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
  const recipient = toWhatsAppRecipient(customer.phone, {
    defaultCountryCode: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE
  });
  const body = buildReminderMessage({ customer, gymName, reminderType });
  const templatePayload = buildReminderTemplatePayload({ customer, gymName, reminderType });
  const response = await sendWhatsAppMessage({ to: recipient, body, templatePayload });

  return {
    messageId: response.messages?.[0]?.id || "",
    reminderType
  };
}

module.exports = {
  DUE_AMOUNT_REMINDER_INTERVAL_DAYS,
  EXPIRED_REMINDER_OFFSET,
  EXPIRY_REMINDER_OFFSETS,
  buildReminderMessage,
  buildReminderKey,
  buildReminderTemplatePayload,
  formatDisplayDate,
  formatCurrency,
  getDueReminderEvent,
  getDueAmountReminderEvent,
  getReminderHistory,
  getConfiguredWhatsAppSender,
  getMetaWhatsAppApiVersion,
  hasReminderBeenSent,
  sendWhatsAppMessage,
  sendMembershipReminder,
  toWhatsAppRecipient,
  toWhatsAppAddress: toWhatsAppRecipient
};
