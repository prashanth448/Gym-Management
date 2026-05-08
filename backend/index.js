
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const { configureStore, getStoreMode } = require("./data/store");
const requestLogger = require("./middleware/requestLogger");
const { apiLimiter } = require("./middleware/rateLimit");
const { initRealtime } = require("./realtime");
const { startWhatsAppReminderScheduler } = require("./services/whatsappReminderScheduler");

function getAllowedOrigins() {
  const configuredOrigins = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configuredOrigins.length ? configuredOrigins : true;
}

async function startServer() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required before starting the backend.");
  }

  const app = express();
  const mongoMode = await connectDB();
  const port = process.env.PORT || 5000;
  const corsOptions = {
    origin: getAllowedOrigins()
  };

  await configureStore({ mode: mongoMode });
  startWhatsAppReminderScheduler();

  app.set("trust proxy", process.env.TRUST_PROXY?.trim() || 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );
  app.use(cors(corsOptions));
  app.use(requestLogger);
  app.use(express.json());

  app.use("/api/health", require("./routes/health"));
  app.use("/api", apiLimiter);
  app.use("/api", require("./routes/auth"));
  app.use("/api/customers", require("./routes/customers"));
  app.use("/api/payments", require("./routes/payments"));
  app.use("/api/admin", require("./routes/admin"));

  const server = http.createServer(app);
  initRealtime(server);

  server.listen(port, () =>
    console.log(`Server running on ${port} using ${getStoreMode()}.`)
  );
}

startServer().catch((error) => {
  console.error("Unable to start the server.", error);
  process.exit(1);
});
