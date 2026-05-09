const router = require("express").Router();
const auth = require("../middleware/auth");
const { getStore } = require("../data/store");
const { disconnectGymRealtime, emitAdminDataChanged } = require("../realtime");
const { validatePasswordStrength } = require("../utils/passwords");
const { isValidPhoneNumber, normalizePhoneNumber } = require("../utils/otp");

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function requireAdmin(req, res) {
  if (req.user.role !== "admin") {
    res.status(403).json({ message: "Admin access required." });
    return false;
  }

  return true;
}

async function validateGymOwnerPayload(payload, currentGymId = null) {
  if (
    !payload.gymId ||
    !payload.gymName ||
    !payload.ownerName ||
    !payload.email ||
    !payload.phone ||
    !payload.city ||
    !payload.status
  ) {
    return "Please complete all gym owner fields before saving.";
  }

  const store = getStore();

  if (await store.isGymOwnerGymIdTaken(payload.gymId, currentGymId)) {
    return "That gym ID is already in use.";
  }

  if (await store.isGymOwnerEmailTaken(payload.email.toLowerCase(), currentGymId)) {
    return "That email address is already assigned to another gym owner.";
  }

  if (!isValidEmail(payload.email)) {
    return "Enter a valid email address.";
  }

  if (!isValidPhoneNumber(payload.phone)) {
    return "Enter a valid gym owner mobile number with 10 to 15 digits.";
  }

  if (!currentGymId && !payload.password) {
    return "A password is required when creating a gym owner.";
  }

  if (payload.password) {
    const passwordMessage = validatePasswordStrength(payload.password);

    if (passwordMessage) {
      return passwordMessage;
    }
  }

  return "";
}

router.get("/gym-owners", auth, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  res.json(await getStore().listGymOwners());
});

router.post("/gym-owners", auth, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const payload = {
    gymId: req.body.gymId?.trim().toUpperCase(),
    gymName: req.body.gymName?.trim(),
    ownerName: req.body.ownerName?.trim(),
    email: req.body.email?.trim().toLowerCase(),
    phone: normalizePhoneNumber(req.body.phone),
    city: req.body.city?.trim(),
    status: req.body.status,
    password: req.body.password?.trim()
  };

  const message = await validateGymOwnerPayload(payload);

  if (message) {
    return res.status(400).json({ message });
  }

  const gymOwner = await getStore().createGymOwner(payload);
  emitAdminDataChanged("gym-owner-created", { gymId: gymOwner.gymId });
  res.json(gymOwner);
});

router.put("/gym-owners/:gymId", auth, async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const currentGymId = req.params.gymId;
  const payload = {
    gymId: req.body.gymId?.trim().toUpperCase(),
    gymName: req.body.gymName?.trim(),
    ownerName: req.body.ownerName?.trim(),
    email: req.body.email?.trim().toLowerCase(),
    phone: normalizePhoneNumber(req.body.phone),
    city: req.body.city?.trim(),
    status: req.body.status,
    password: req.body.password?.trim()
  };

  const message = await validateGymOwnerPayload(payload, currentGymId);

  if (message) {
    return res.status(400).json({ message });
  }

  const gym = await getStore().updateGymOwner(currentGymId, payload);

  if (!gym) {
    return res.status(404).json({ message: "Gym owner not found." });
  }

  emitAdminDataChanged("gym-owner-updated", {
    currentGymId,
    gymId: gym.gymId
  });

  if (currentGymId !== gym.gymId || gym.status !== "Active" || payload.password) {
    disconnectGymRealtime(currentGymId);
  }

  res.json(gym);
});

module.exports = router;
