const crypto = require("crypto");

const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

function isPasswordHash(value) {
  return typeof value === "string" && value.startsWith(`${HASH_PREFIX}$`);
}

function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt);
  return `${HASH_PREFIX}$${salt}$${key.toString("hex")}`;
}

async function verifyPassword(password, storedPassword) {
  if (typeof password !== "string" || typeof storedPassword !== "string") {
    return false;
  }

  if (!isPasswordHash(storedPassword)) {
    return storedPassword === password;
  }

  const [, salt, storedKey] = storedPassword.split("$");

  if (!salt || !storedKey) {
    return false;
  }

  const derivedKey = await deriveKey(password, salt);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(storedKey, "hex"),
      derivedKey
    );
  } catch (error) {
    return false;
  }
}

function validatePasswordStrength(password) {
  if (typeof password !== "string") {
    return "Password is required.";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number.";
  }

  return "";
}

module.exports = {
  hashPassword,
  isPasswordHash,
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength,
  verifyPassword
};
