const rateLimit = require("express-rate-limit");

function resolveWindowMs(envKey, fallbackMinutes) {
  const rawValue = Number(process.env[envKey]);
  const minutes = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : fallbackMinutes;
  return minutes * 60 * 1000;
}

function resolveMax(envKey, fallbackMax) {
  const rawValue = Number(process.env[envKey]);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : fallbackMax;
}

function createLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    windowMs: resolveWindowMs(options.windowEnvKey, options.windowMinutes),
    max: resolveMax(options.maxEnvKey, options.maxRequests),
    message: {
      message: options.message
    }
  });
}

const apiLimiter = createLimiter({
  windowEnvKey: "API_RATE_LIMIT_WINDOW_MINUTES",
  windowMinutes: 15,
  maxEnvKey: "API_RATE_LIMIT_MAX_REQUESTS",
  maxRequests: 300,
  message: "Too many API requests. Please try again in a few minutes."
});

const authLimiter = createLimiter({
  windowEnvKey: "AUTH_RATE_LIMIT_WINDOW_MINUTES",
  windowMinutes: 15,
  maxEnvKey: "AUTH_RATE_LIMIT_MAX_ATTEMPTS",
  maxRequests: 8,
  skipSuccessfulRequests: true,
  message: "Too many authentication attempts. Please wait a few minutes and try again."
});

const passwordResetRequestLimiter = createLimiter({
  windowEnvKey: "PASSWORD_RESET_REQUEST_WINDOW_MINUTES",
  windowMinutes: 15,
  maxEnvKey: "PASSWORD_RESET_REQUEST_MAX_ATTEMPTS",
  maxRequests: 3,
  message: "Too many password reset requests. Please wait a few minutes and try again."
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetRequestLimiter
};
