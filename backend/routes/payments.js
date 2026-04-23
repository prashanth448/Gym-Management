const router = require("express").Router();
const auth = require("../middleware/auth");
const { getStore } = require("../data/store");

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

  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const month = String(req.query.month || "__all__").trim() || "__all__";
    const data = await getStore().listPaymentEntriesPageByGymId(req.user.gymId, {
      page,
      pageSize,
      month
    });

    res.json(data);
  } catch (error) {
    console.error("Unable to load payment entries.", error);
    res.status(500).json({ message: "Unable to load payment details." });
  }
});

module.exports = router;
