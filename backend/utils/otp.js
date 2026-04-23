const crypto = require("crypto");

const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

function normalizePhoneNumber(value) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function isValidPhoneNumber(value) {
  const digits = normalizePhoneNumber(value);
  return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;
}

function detectIdentifierType(identifier) {
  if (typeof identifier !== "string") {
    return null;
  }

  return identifier.includes("@") ? "email" : "phone";
}

function normalizeIdentifier(identifier) {
  const type = detectIdentifierType(identifier);

  if (type === "email") {
    return identifier.trim().toLowerCase();
  }

  if (type === "phone") {
    return normalizePhoneNumber(identifier);
  }

  return "";
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function getOtpSecret() {
  return process.env.OTP_SECRET || process.env.JWT_SECRET;
}

function hashOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(`${getOtpSecret()}:${otp}`)
    .digest("hex");
}

function verifyOtp(otp, otpHash) {
  return hashOtp(otp) === otpHash;
}

function getOtpExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OTP_TTL_MINUTES);
  return expiresAt;
}

function maskEmail(email) {
  const [localPart = "", domain = ""] = email.split("@");

  if (!localPart || !domain) {
    return email;
  }

  const safeLocal =
    localPart.length <= 2
      ? `${localPart[0] || ""}*`
      : `${localPart.slice(0, 2)}***`;

  return `${safeLocal}@${domain}`;
}

function maskPhone(phone) {
  const digits = normalizePhoneNumber(phone);

  if (digits.length <= 4) {
    return digits;
  }

  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskDestination(channel, destination) {
  return channel === "email" ? maskEmail(destination) : maskPhone(destination);
}

module.exports = {
  MAX_OTP_ATTEMPTS,
  detectIdentifierType,
  generateOtp,
  getOtpExpiryDate,
  hashOtp,
  isValidPhoneNumber,
  maskDestination,
  normalizeIdentifier,
  normalizePhoneNumber,
  verifyOtp
};
