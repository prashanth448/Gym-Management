
const router = require("express").Router();
const auth = require("../middleware/auth");
const { getStore } = require("../data/store");
const { diffInDays, getTodayDate } = require("../utils/date");

function requireOwner(req, res) {
  if (req.user.role !== "owner") {
    res.status(403).json({ message: "Owner access required." });
    return false;
  }

  return true;
}

router.get("/", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const customers = await getStore().listCustomersByGymId(req.user.gymId);
  const today = getTodayDate();

  const alerts = customers
    .map((c) => {
      const diff = diffInDays(today, c.planEnd);

      if (diff === null) {
        return null;
      }

      if (diff < 0) return { name: c.fullName, type: "expired" };
      if (diff <= 3) return { name: c.fullName, type: "expiring" };
      return null;
    })
    .filter(Boolean);

  res.json(alerts);
});

module.exports = router;
