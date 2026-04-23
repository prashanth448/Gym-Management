const router = require("express").Router();
const mongoose = require("mongoose");
const { getStoreMode } = require("../data/store");

router.get("/", (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isDbConnected = dbState === 1;
  const uptimeSeconds = Math.floor(process.uptime());

  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? "ok" : "degraded",
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    database: {
      connected: isDbConnected,
      state: dbState
    },
    storeMode: getStoreMode()
  });
});

module.exports = router;
