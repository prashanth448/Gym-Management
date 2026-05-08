const DAY_IN_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function getTodayDate() {
  return formatDate(new Date());
}

function addDaysToDateString(value, days) {
  const date = parseDateOnly(value);

  if (!date || !Number.isFinite(days)) {
    return "";
  }

  date.setDate(date.getDate() + Math.trunc(days));
  return formatDate(date);
}

function diffInDays(fromValue, toValue) {
  const fromDate = parseDateOnly(fromValue);
  const toDate = parseDateOnly(toValue);

  if (!fromDate || !toDate) {
    return null;
  }

  return Math.round((toDate - fromDate) / DAY_IN_MS);
}

module.exports = {
  addDaysToDateString,
  diffInDays,
  formatDate,
  getTodayDate,
  parseDateOnly
};
