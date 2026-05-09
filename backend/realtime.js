const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getStore } = require("./data/store");
const { isTokenStaleForUser } = require("./utils/session");

let io = null;

function isProductionEnv() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function extractSocketToken(socket) {
  const authToken =
    typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token
      : "";
  const headerToken =
    typeof socket.handshake.headers?.authorization === "string"
      ? socket.handshake.headers.authorization
      : "";
  const token = authToken || headerToken;

  if (!token) {
    return "";
  }

  return token.startsWith("Bearer ") ? token.slice("Bearer ".length).trim() : token.trim();
}

function getAllowedOrigins() {
  const configuredOrigins = (process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (isProductionEnv() && !configuredOrigins.length) {
    throw new Error("CLIENT_ORIGIN must be configured in production.");
  }

  return configuredOrigins.length ? configuredOrigins : true;
}

async function resolveSocketUser(socket) {
  const token = extractSocketToken(socket);

  if (!token) {
    throw new Error("Authentication token is required.");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await getStore().findUserByGymId(decoded.gymId);

  if (!user) {
    throw new Error("User account no longer exists.");
  }

  if (isTokenStaleForUser(decoded, user)) {
    throw new Error("Session expired. Please sign in again.");
  }

  if (user.role === "owner" && user.status !== "Active") {
    throw new Error(
      user.status === "Suspended"
        ? "This gym owner account is suspended."
        : "This gym owner account is not active yet."
    );
  }

  return user;
}

function initRealtime(server) {
  io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ["GET", "POST"]
    }
  });

  io.use(async (socket, next) => {
    try {
      socket.user = await resolveSocketUser(socket);
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const { user } = socket;

    socket.join(`user:${user.gymId}`);

    if (user.role === "admin") {
      socket.join("admins");
    }

    if (user.role === "owner") {
      socket.join(`gym:${user.gymId}`);
    }
  });

  return io;
}

function emitGymDataChanged(gymId, reason) {
  io?.to(`gym:${gymId}`).emit("gym:dataChanged", {
    gymId,
    reason,
    occurredAt: new Date().toISOString()
  });
}

function emitAdminDataChanged(reason, payload = {}) {
  io?.to("admins").emit("admin:dataChanged", {
    reason,
    occurredAt: new Date().toISOString(),
    ...payload
  });
}

function disconnectGymRealtime(gymId) {
  if (!io) {
    return;
  }

  io.in(`gym:${gymId}`).disconnectSockets(true);
  io.in(`user:${gymId}`).disconnectSockets(true);
}

module.exports = {
  disconnectGymRealtime,
  emitAdminDataChanged,
  emitGymDataChanged,
  initRealtime
};
