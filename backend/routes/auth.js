const router = require("express").Router();
const jwt = require("jsonwebtoken");
const PasswordResetOtp = require("../models/PasswordResetOtp");
const { getStore } = require("../data/store");
const { authLimiter } = require("../middleware/rateLimit");
const {
  hashPassword,
  isPasswordHash,
  validatePasswordStrength,
  verifyPassword
} = require("../utils/passwords");
const {
  MAX_OTP_ATTEMPTS,
  generateOtp,
  getOtpExpiryDate,
  hashOtp,
  isValidPhoneNumber,
  normalizePhoneNumber,
  verifyOtp
} = require("../utils/otp");
const { deliverOtp } = require("../utils/otpDelivery");

async function findUserByPhone(store, phone) {
  return store.findUserByPhone(normalizePhoneNumber(phone));
}

router.post("/setup/admin", authLimiter, async (req, res) => {
  const store = getStore();
  const name = req.body.name?.trim();
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password?.trim();
  const phone = normalizePhoneNumber(req.body.phone);
  const setupKey = String(req.body.setupKey || "").trim();

  if (!name || !email || !password || !phone) {
    return res.status(400).json({
      message: "Name, email, mobile number, and password are required."
    });
  }

  if (await store.countAdmins()) {
    return res.status(409).json({ message: "An admin account already exists." });
  }

  if (!process.env.ADMIN_SETUP_KEY) {
    return res.status(403).json({
      message:
        "ADMIN_SETUP_KEY is not configured on the backend. Set it before creating the first admin."
    });
  }

  if (setupKey !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).json({ message: "Invalid admin setup key." });
  }

  const passwordMessage = validatePasswordStrength(password);

  if (passwordMessage) {
    return res.status(400).json({ message: passwordMessage });
  }

  if (!isValidPhoneNumber(phone)) {
    return res.status(400).json({
      message: "Provide a valid mobile number with 10 to 15 digits."
    });
  }

  const user = await store.createAdmin({
    gymId: "ADMIN001",
    name,
    email,
    password,
    phone,
    city: req.body.city?.trim()
  });

  res.status(201).json({
    message: "Admin account created successfully.",
    user
  });
});

router.post("/forgot-password/request-otp", authLimiter, async (req, res) => {
  const identifier = normalizePhoneNumber(req.body.identifier || req.body.phone);
  const store = getStore();

  if (!identifier) {
    return res.status(400).json({
      message: "Provide a valid mobile number to receive the OTP."
    });
  }

  const user = await findUserByPhone(store, identifier);

  if (!user) {
    return res.json({
      message: "If an account matches that contact, an OTP has been sent.",
      maskedDestination: `******${identifier.slice(-4)}`
    });
  }

  const destination = normalizePhoneNumber(user.phone);

  if (!destination) {
    return res.status(400).json({
      message: "That user does not have a mobile number available for OTP delivery."
    });
  }

  const otp = generateOtp();

  await PasswordResetOtp.deleteMany({
    userId: user._id,
    usedAt: null
  });

  await PasswordResetOtp.create({
    userId: user._id,
    gymId: user.gymId,
    identifier,
    channel: "phone",
    destination,
    otpHash: hashOtp(otp),
    expiresAt: getOtpExpiryDate()
  });

  const delivery = await deliverOtp({
    channel: "phone",
    destination,
    otp
  });

  res.json({
    message: `OTP sent to ${delivery.maskedDestination}.`,
    maskedDestination: delivery.maskedDestination,
    ...(delivery.debugOtp ? { debugOtp: delivery.debugOtp } : {})
  });
});

router.post("/forgot-password/reset", authLimiter, async (req, res) => {
  const identifier = normalizePhoneNumber(req.body.identifier || req.body.phone);
  const otp = String(req.body.otp || "").trim();
  const newPassword = String(req.body.newPassword || "");
  const store = getStore();

  if (!identifier || !otp || !newPassword) {
    return res.status(400).json({
      message:
        "Provide a valid mobile number, the OTP, and a new password."
      });
  }

  const passwordMessage = validatePasswordStrength(newPassword);

  if (passwordMessage) {
    return res.status(400).json({ message: passwordMessage });
  }

  const user = await findUserByPhone(store, identifier);

  if (!user) {
    return res.status(400).json({ message: "Invalid OTP or user." });
  }

  const otpRecord = await PasswordResetOtp.findOne({
    userId: user._id,
    identifier,
    usedAt: null,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return res.status(400).json({ message: "OTP expired or not found. Request a new OTP." });
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    await PasswordResetOtp.deleteMany({ userId: user._id, usedAt: null });
    return res.status(400).json({ message: "Too many invalid OTP attempts. Request a new OTP." });
  }

  if (!verifyOtp(otp, otpRecord.otpHash)) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    return res.status(400).json({ message: "Invalid OTP." });
  }

  await store.updateUserPassword(user.gymId, await hashPassword(newPassword));
  otpRecord.usedAt = new Date();
  await otpRecord.save();
  await PasswordResetOtp.deleteMany({
    userId: user._id,
    _id: { $ne: otpRecord._id }
  });

  res.json({ message: "Password updated successfully. You can now sign in." });
});

router.post("/login", authLimiter, async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password ?? "";
  const store = getStore();
  const user = await store.findUserByEmail(email);

  if (!user || !(await verifyPassword(password, user.password))) {
    return res.status(401).json({ message: "Invalid" });
  }

  if (user.role === "owner" && user.status !== "Active") {
    return res.status(403).json({
      message:
        user.status === "Suspended"
          ? "This gym owner account is suspended. Please contact the administrator."
          : "This gym owner account is not active yet. Please contact the administrator."
    });
  }

  if (!isPasswordHash(user.password)) {
    await store.updateUserPassword(user.gymId, await hashPassword(password));
  }

  const token = jwt.sign(
    { gymId: user.gymId, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      role: user.role,
      gymId: user.gymId,
      email: user.email,
      name: user.role === "admin" ? user.name : user.ownerName
    }
  });
});

module.exports = router;
