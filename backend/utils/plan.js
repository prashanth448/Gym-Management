
const { formatDate, parseDateOnly } = require("./date");

const PLAN_OPTIONS = ["1 Month", "3 Months", "6 Months", "1 Year"];

function isValidPlan(plan) {
  return PLAN_OPTIONS.includes(plan);
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(date, months) {
  const targetMonthIndex = date.getMonth() + months;
  const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(
    date.getDate(),
    getDaysInMonth(targetYear, normalizedMonthIndex)
  );

  date.setFullYear(targetYear, normalizedMonthIndex, targetDay);
}

function addYearsClamped(date, years) {
  const targetYear = date.getFullYear() + years;
  const targetMonthIndex = date.getMonth();
  const targetDay = Math.min(
    date.getDate(),
    getDaysInMonth(targetYear, targetMonthIndex)
  );

  date.setFullYear(targetYear, targetMonthIndex, targetDay);
}

function getPlanEnd(start, plan) {
  const d = parseDateOnly(start);

  if (!d || !isValidPlan(plan)) {
    return "";
  }

  if (plan === "1 Month") addMonthsClamped(d, 1);
  if (plan === "3 Months") addMonthsClamped(d, 3);
  if (plan === "6 Months") addMonthsClamped(d, 6);
  if (plan === "1 Year") addYearsClamped(d, 1);
  d.setDate(d.getDate() - 1);

  return formatDate(d);
}

module.exports = {
  PLAN_OPTIONS,
  getPlanEnd,
  isValidPlan
};
