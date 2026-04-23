
const { formatDate, parseDateOnly } = require("./date");

const PLAN_OPTIONS = ["1 Month", "3 Months", "6 Months", "1 Year"];

function isValidPlan(plan) {
  return PLAN_OPTIONS.includes(plan);
}

function getPlanEnd(start, plan) {
  const d = parseDateOnly(start);

  if (!d || !isValidPlan(plan)) {
    return "";
  }

  if (plan === "1 Month") d.setMonth(d.getMonth() + 1);
  if (plan === "3 Months") d.setMonth(d.getMonth() + 3);
  if (plan === "6 Months") d.setMonth(d.getMonth() + 6);
  if (plan === "1 Year") d.setFullYear(d.getFullYear() + 1);

  return formatDate(d);
}

module.exports = {
  PLAN_OPTIONS,
  getPlanEnd,
  isValidPlan
};
