export const PLAN_OPTIONS = ["1 Month", "3 Months", "6 Months", "1 Year"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodayDateString() {
  return formatDateOnly(new Date());
}

export function getPlanEndDate(startDate, plan) {
  const date = parseDateOnly(startDate);

  if (!date) {
    return "";
  }

  if (plan === "1 Month") {
    date.setMonth(date.getMonth() + 1);
  }

  if (plan === "3 Months") {
    date.setMonth(date.getMonth() + 3);
  }

  if (plan === "6 Months") {
    date.setMonth(date.getMonth() + 6);
  }

  if (plan === "1 Year") {
    date.setFullYear(date.getFullYear() + 1);
  }

  return formatDateOnly(date);
}

export function getMembershipState(planEnd) {
  if (!planEnd) {
    return { label: "Unknown", tone: "neutral" };
  }

  const today = parseDateOnly(getTodayDateString());
  const endDate = parseDateOnly(planEnd);

  if (!today || !endDate) {
    return { label: "Unknown", tone: "neutral" };
  }

  const diffInDays = Math.round((endDate - today) / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) {
    return { label: "Expired", tone: "danger" };
  }

  if (diffInDays <= 3) {
    return { label: "Expiring soon", tone: "warning" };
  }

  return { label: "Active", tone: "success" };
}

export function formatDisplayDate(value) {
  if (!value) {
    return "Not recorded";
  }

  const parsed = parseDateOnly(value);

  if (!parsed) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(parsed);
}

export function isAttendedToday(lastAttended) {
  return lastAttended === getTodayDateString();
}
